/**
 * Spatial+temporal signal correlator (TRD §5 "The correlator").
 *
 * Reads from `signal_events` and groups events that fall within both
 * a time window (default 90 s) and a distance threshold (default 300 m).
 * A cluster with ≥ minSignals distinct sources becomes an incident.
 *
 * Pure functions live at the top so they're easy to unit-test without
 * a DB; the DB-touching wrapper is at the bottom.
 */

import { signalEvents, type SignalEvent } from "@caltrans/db";
import { gte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { getConfig } from "./config";
import { log } from "./logger";

export interface FusionEvent {
  id: string;
  sourceType: SignalEvent["sourceType"];
  sourceId: string;
  occurredAt: Date;
  lat: number;
  lng: number;
  payload: Record<string, unknown>;
  confidence: number | null;
}

export interface FusionCluster {
  /** Deterministic id derived from sorted member event ids — used as gbrain slug suffix. */
  fusionKey: string;
  centroidLat: number;
  centroidLng: number;
  earliestAt: Date;
  latestAt: Date;
  members: FusionEvent[];
  /** Distinct source_type tally (camera, 911, citizen) — key to severity scoring. */
  sourceTypeCounts: Record<string, number>;
}

export interface FusionOptions {
  windowS: number;
  radiusM: number;
  minSignals: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Haversine great-circle distance between two lat/lng pairs, in meters. */
export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(x));
}

/**
 * Pure clustering. Greedy single-pass: each event either joins an existing
 * cluster whose centroid is within `radiusM` AND latest event within `windowS`,
 * or starts a new one. Good enough for hackathon scale; would want HDBSCAN
 * or DBSCAN at production volume.
 */
export function clusterSignals(
  events: readonly FusionEvent[],
  opts: FusionOptions,
): FusionCluster[] {
  // Sort by time so we can compare windows linearly.
  const sorted = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  const clusters: FusionCluster[] = [];

  for (const ev of sorted) {
    let bestCluster: FusionCluster | null = null;
    for (const c of clusters) {
      const dtSec = Math.abs(c.latestAt.getTime() - ev.occurredAt.getTime()) / 1000;
      if (dtSec > opts.windowS) continue;
      const dist = haversineMeters(c.centroidLat, c.centroidLng, ev.lat, ev.lng);
      if (dist > opts.radiusM) continue;
      bestCluster = c;
      break;
    }

    if (bestCluster) {
      bestCluster.members.push(ev);
      // Update centroid as running mean — simple and stable enough.
      const n = bestCluster.members.length;
      bestCluster.centroidLat =
        bestCluster.centroidLat + (ev.lat - bestCluster.centroidLat) / n;
      bestCluster.centroidLng =
        bestCluster.centroidLng + (ev.lng - bestCluster.centroidLng) / n;
      if (ev.occurredAt > bestCluster.latestAt) bestCluster.latestAt = ev.occurredAt;
      if (ev.occurredAt < bestCluster.earliestAt) bestCluster.earliestAt = ev.occurredAt;
      bestCluster.sourceTypeCounts[ev.sourceType] =
        (bestCluster.sourceTypeCounts[ev.sourceType] ?? 0) + 1;
    } else {
      clusters.push({
        fusionKey: "",
        centroidLat: ev.lat,
        centroidLng: ev.lng,
        earliestAt: ev.occurredAt,
        latestAt: ev.occurredAt,
        members: [ev],
        sourceTypeCounts: { [ev.sourceType]: 1 },
      });
    }
  }

  // Filter by minSignals and stamp a STABLE location+time-bucket fusionKey.
  // Stability matters because the same incident grows across ticks: events
  // arrive faster than INTERVAL_S, so each tick sees a larger superset. A
  // member-set hash would emit a "new" incident every time the cluster
  // gained a member, which produced KG spam (25 nodes for 3 actual events).
  //
  // Bucket lat/lng to ~100m and earliest_at to 5-minute slots. Same corner
  // + same 5-min window = same key = the dedupe in tick.ts swallows it.
  return clusters
    .filter((c) => c.members.length >= opts.minSignals)
    .map((c) => ({
      ...c,
      fusionKey: makeLocationFusionKey(c.centroidLat, c.centroidLng, c.earliestAt),
    }));
}

const FUSION_BUCKET_MS = 5 * 60 * 1000; // 5 minutes

export function makeLocationFusionKey(lat: number, lng: number, earliestAt: Date): string {
  // 3 decimal places: ~111m at the equator, ~90m at SF longitude. Comfortably
  // narrower than the 300m fusion radius so two adjacent clusters get
  // distinct keys; wider than typical GPS jitter so the same corner stays
  // stable as the centroid drifts with new members.
  const latRounded = Math.round(lat * 1000) / 1000;
  const lngRounded = Math.round(lng * 1000) / 1000;
  const bucket = Math.floor(earliestAt.getTime() / FUSION_BUCKET_MS);
  // Encode lat/lng without minus signs / dots so the slug is URL-safe and
  // visually scans like the existing gbrain slugs.
  const latStr = latRounded.toFixed(3).replace(/[.-]/g, "_");
  const lngStr = lngRounded.toFixed(3).replace(/[.-]/g, "_");
  return `loc${latStr}_${lngStr}_t${bucket}`;
}

/**
 * Severity = function of (signal_type diversity, count, max confidence).
 * Three or more distinct source types is always at least "med"; high confidence
 * 911 + camera within the same cluster is "high".
 */
export function severityFor(cluster: FusionCluster): "low" | "med" | "high" {
  const distinctTypes = Object.keys(cluster.sourceTypeCounts).length;
  const hasCam =
    "camera_public" in cluster.sourceTypeCounts ||
    "camera_private" in cluster.sourceTypeCounts;
  const has911 = "call_911" in cluster.sourceTypeCounts;
  const maxConf = Math.max(
    0,
    ...cluster.members.map((m) => m.confidence ?? 0),
  );

  if (distinctTypes >= 3) return "high";
  if (hasCam && has911 && maxConf >= 0.7) return "high";
  if (distinctTypes >= 2) return "med";
  return "low";
}

/**
 * Read recent signal_events. The cursor is `occurred_at >= now - lookback_s` —
 * cheap (uses the existing desc index) and naturally dedupes because we cache
 * emitted fusionKeys in the worker process.
 */
export async function fetchRecentSignalEvents(
  lookbackS: number,
): Promise<FusionEvent[]> {
  const cutoff = new Date(Date.now() - lookbackS * 1000);
  const db = getDb();
  const rows = await db
    .select()
    .from(signalEvents)
    .where(gte(signalEvents.occurredAt, cutoff))
    .orderBy(sql`${signalEvents.occurredAt} ASC`);
  return rows.map((r) => ({
    id: r.id,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    occurredAt: r.occurredAt,
    lat: r.lat,
    lng: r.lng,
    payload: (r.payload as Record<string, unknown>) ?? {},
    confidence: r.confidence ?? null,
  }));
}

/**
 * Convenience: read recent events + cluster them in one call, using the
 * worker's configured window/radius/min knobs.
 */
export async function fuseRecent(): Promise<FusionCluster[]> {
  const cfg = getConfig();
  // Look back twice the window so cross-window stragglers can still join.
  const lookbackS = Math.max(cfg.FUSION_WINDOW_S * 2, 180);
  const events = await fetchRecentSignalEvents(lookbackS);
  const clusters = clusterSignals(events, {
    windowS: cfg.FUSION_WINDOW_S,
    radiusM: cfg.FUSION_RADIUS_M,
    minSignals: cfg.FUSION_MIN_SIGNALS,
  });
  log.info({
    scope: "fusion",
    msg: "swept recent signals",
    extra: {
      lookback_s: lookbackS,
      events: events.length,
      clusters: clusters.length,
    },
  });
  return clusters;
}
