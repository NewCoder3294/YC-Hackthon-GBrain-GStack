/**
 * Pin selection for the Caltrans public-camera detector (TRD §2 / §3.1).
 *
 * The worker watches a small fixed set of San Francisco freeway cameras.
 * We prefer the synced `cameras` DB table (populated by @caltrans/sync); if
 * that is empty (sync hasn't run yet) we fall back to the official, no-auth
 * District 4 CCTV status JSON and parse just enough to find SF HLS cams.
 *
 * DI mirrors `syncCameras` in @caltrans/sync: a `{ db, fetch }` deps object,
 * so the whole thing is unit-testable without live network or a real DB.
 */

import { cameras, type Db } from "@caltrans/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

/** Official Caltrans D4 CCTV status feed — no auth required. */
export const CALTRANS_D4_URL =
  "https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json";

/**
 * San Francisco bounding box (TRD demo scope). Caltrans D4 is the whole
 * Bay Area; we only want SF-county freeway cams.
 */
export const SF_BBOX = {
  minLat: 37.7,
  maxLat: 37.83,
  minLng: -122.52,
  maxLng: -122.35,
} as const;

export const SF_DISTRICT = 4;
export const DEFAULT_PIN_LIMIT = 4;

/** A camera the worker will watch. */
export interface PinnedCamera {
  readonly caltransId: string;
  readonly description: string;
  readonly lat: number;
  readonly lng: number;
  readonly streamUrl: string;
}

export interface PinDeps {
  readonly db: Db;
  readonly fetch: typeof globalThis.fetch;
  /** Override the fallback feed URL (tests). */
  readonly url?: string;
}

export interface PinOptions {
  /** Force-pin specific Caltrans ids (demo determinism). Order is preserved. */
  readonly caltransIds?: readonly string[];
  /** Max cameras to return. Default {@link DEFAULT_PIN_LIMIT}. */
  readonly limit?: number;
}

function withinSfBbox(lat: number, lng: number): boolean {
  return (
    lat >= SF_BBOX.minLat &&
    lat <= SF_BBOX.maxLat &&
    lng >= SF_BBOX.minLng &&
    lng <= SF_BBOX.maxLng
  );
}

/**
 * Minimal fallback parser for the D4 status JSON. The existing
 * @caltrans/sync parser does NOT capture county, so we parse our own
 * narrow shape here and filter on `location.county === "San Francisco"`
 * (case-insensitive) plus an SF bbox guard.
 */
const fallbackCctvSchema = z.object({
  cctv: z.object({
    index: z.string(),
    location: z.object({
      county: z.string().optional().default(""),
      district: z.string().optional().default(""),
      latitude: z.string(),
      longitude: z.string(),
      locationName: z.string().optional().default(""),
      nearbyPlace: z.string().optional().default(""),
      route: z.string().optional().default(""),
    }),
    imageData: z.object({
      streamingVideoURL: z.string().optional().default(""),
    }),
  }),
});

const fallbackResponseSchema = z.object({
  data: z.array(fallbackCctvSchema),
});

/** Pure parser for the D4 status JSON → SF HLS cameras. Exported for tests. */
export function parseFallbackSfCameras(input: unknown): PinnedCamera[] {
  const parsed = fallbackResponseSchema.parse(input);
  const out: PinnedCamera[] = [];

  for (const { cctv } of parsed.data) {
    const streamUrl = cctv.imageData.streamingVideoURL.trim();
    // HLS only — the detector pipes a live stream to ffmpeg.
    if (!streamUrl.toLowerCase().endsWith(".m3u8")) continue;

    const county = cctv.location.county.trim().toLowerCase();
    if (county !== "san francisco") continue;

    const lat = Number(cctv.location.latitude);
    const lng = Number(cctv.location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!withinSfBbox(lat, lng)) continue;

    const description =
      cctv.location.locationName.trim() ||
      `${cctv.location.route} @ ${cctv.location.nearbyPlace}`.trim() ||
      cctv.index;

    out.push({ caltransId: cctv.index, description, lat, lng, streamUrl });
  }

  return out;
}

function orderByForcedIds(
  found: readonly PinnedCamera[],
  forcedIds: readonly string[] | undefined,
): PinnedCamera[] {
  if (!forcedIds || forcedIds.length === 0) return [...found];
  const byId = new Map(found.map((c) => [c.caltransId, c]));
  const ordered: PinnedCamera[] = [];
  for (const id of forcedIds) {
    const cam = byId.get(id);
    if (cam) ordered.push(cam);
  }
  return ordered;
}

async function selectFromDb(
  db: Db,
  forcedIds: readonly string[] | undefined,
  limit: number,
): Promise<PinnedCamera[]> {
  const rows = await db
    .select({
      caltransId: cameras.caltransId,
      description: cameras.description,
      lat: cameras.lat,
      lng: cameras.lng,
      streamUrl: cameras.streamUrl,
    })
    .from(cameras)
    .where(
      and(
        eq(cameras.district, SF_DISTRICT),
        eq(cameras.streamType, "hls"),
        eq(cameras.isActive, true),
        gte(cameras.lat, SF_BBOX.minLat),
        lte(cameras.lat, SF_BBOX.maxLat),
        gte(cameras.lng, SF_BBOX.minLng),
        lte(cameras.lng, SF_BBOX.maxLng),
      ),
    );

  const candidates: PinnedCamera[] = rows.map((r) => ({
    caltransId: r.caltransId,
    description: r.description,
    lat: r.lat,
    lng: r.lng,
    streamUrl: r.streamUrl,
  }));

  if (forcedIds && forcedIds.length > 0) {
    return orderByForcedIds(candidates, forcedIds).slice(0, limit);
  }
  return candidates.slice(0, limit);
}

async function selectFromFallback(
  deps: PinDeps,
  forcedIds: readonly string[] | undefined,
  limit: number,
): Promise<PinnedCamera[]> {
  const url = deps.url ?? CALTRANS_D4_URL;
  const res = await deps.fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`CalTrans D4 fallback fetch failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  const sfCams = parseFallbackSfCameras(json);

  if (forcedIds && forcedIds.length > 0) {
    return orderByForcedIds(sfCams, forcedIds).slice(0, limit);
  }
  return sfCams.slice(0, limit);
}

/**
 * Select 3–4 SF HLS cameras for the worker to watch.
 *
 * Strategy: query the synced DB first; if it yields nothing (sync hasn't
 * populated `cameras` yet) transparently fall back to the official D4
 * status JSON. `opts.caltransIds` force-pins specific ids in that order
 * (demo determinism); `opts.limit` caps the count (default 4).
 */
export async function selectPinnedCameras(
  deps: PinDeps,
  opts: PinOptions = {},
): Promise<PinnedCamera[]> {
  const limit =
    opts.limit !== undefined && opts.limit > 0
      ? opts.limit
      : DEFAULT_PIN_LIMIT;
  const forcedIds = opts.caltransIds;

  const fromDb = await selectFromDb(deps.db, forcedIds, limit);
  if (fromDb.length > 0) return fromDb;

  return selectFromFallback(deps, forcedIds, limit);
}
