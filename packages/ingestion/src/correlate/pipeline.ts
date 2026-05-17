/**
 * Correlation pipeline. A PURE core (`correlate`) — already-read rows in,
 * ranked incidents + GBrain pages out, fully unit-testable with no DB —
 * and a thin IO wrapper (`runCorrelation`) that does the two signal_events
 * reads, calls the core, and upserts pages. Mirrors the repo's
 * pure-core + thin-shell idiom (baseline/run.ts, calls/run.ts).
 */

import { sql } from "drizzle-orm";
import { signalEvents, type Db } from "@caltrans/db";
import { aggregate, type IncidentRow } from "../baseline/metrics";
import type { Logger } from "../logger";
import { BASELINE_DAYS, NARRATE_TOP_N, WINDOW_HOURS } from "./config";
import { buildContexts, contextFor } from "./context";
import { cluster, fnv1a } from "./cluster";
import { centroidsFromSignals } from "./geo";
import { normalizeSignal, selectWindow, type RawRow } from "./window";
import { anomaly, rankIncidents, scoreIncident } from "./score";
import { buildIncidentPages, type IncidentPage } from "./pages";
import { writeIncidentPages } from "./gbrain-writer";
import {
  deterministicNarrate,
  deterministicResolve,
  type Adjudicator,
} from "./adjudicate";
import type { CandidateCluster, ScoredIncident } from "./types";

export interface DatasfBaselineRow {
  occurredAt: string;
  lat: number;
  lng: number;
  neighborhood: string;
  category: string;
  resolution: string;
}

export interface CorrelateInput {
  datasfRows: readonly DatasfBaselineRow[];
  liveRows: readonly RawRow[];
  now: Date;
  adjudicator: Adjudicator;
  windowHours?: number;
}

export interface CorrelationSummary {
  liveSignals: number;
  clusters: number;
  ambiguousResolved: number;
  incidents: number;
  pagesWritten: number;
  failures: { slug: string; message: string }[];
  byTier: Record<string, number>;
}

function refinalize(signals: CandidateCluster["signals"]): CandidateCluster {
  const ids = signals.map((s) => s.id).sort();
  const srcs = new Set(signals.map((s) => s.source));
  const counts = new Map<string, number>();
  for (const s of signals)
    counts.set(s.neighborhood, (counts.get(s.neighborhood) ?? 0) + 1);
  let nbhd = signals[0]?.neighborhood ?? "Unknown";
  let best = -1;
  for (const [v, n] of counts)
    if (n > best || (n === best && v.localeCompare(nbhd) < 0)) {
      nbhd = v;
      best = n;
    }
  return {
    id: `incident-${fnv1a(ids.join(","))}`,
    signals: [...signals].sort((a, b) =>
      a.occurredAt === b.occurredAt
        ? a.id.localeCompare(b.id)
        : a.occurredAt.localeCompare(b.occurredAt),
    ),
    neighborhood: nbhd,
    hasDatasfDup: srcs.has("datasf") && srcs.has("call_911"),
  };
}

/** PURE core: rows → ranked incidents + pages. */
export async function correlate(input: CorrelateInput): Promise<{
  ranked: ScoredIncident[];
  pages: IncidentPage[];
  stats: Omit<CorrelationSummary, "pagesWritten" | "failures">;
}> {
  const { datasfRows, now } = input;
  const hours = input.windowHours ?? WINDOW_HOURS;

  const agg = aggregate(
    datasfRows.map(
      (r): IncidentRow => ({
        occurredAt:
          typeof r.occurredAt === "string"
            ? r.occurredAt
            : new Date(r.occurredAt).toISOString(),
        neighborhood: r.neighborhood,
        category: r.category,
        resolution: r.resolution,
      }),
    ),
    now,
  );
  const contexts = buildContexts(agg);
  const centroids = centroidsFromSignals(
    datasfRows.map((r) => ({
      neighborhood: r.neighborhood,
      lat: r.lat,
      lng: r.lng,
    })),
  );

  const live = selectWindow(
    input.liveRows
      .map((r) => normalizeSignal(r, centroids))
      .filter((s): s is NonNullable<typeof s> => s !== null),
    now,
    hours,
  );

  const { clusters, ambiguous } = cluster(live);

  // Resolve ambiguous pairs deterministically. The merge/split call is
  // a binary geometric decision the deterministic rule already makes
  // well; routing every pair through the LLM was an unbounded,
  // per-pair network cost with negligible quality gain. The LLM seam
  // stays for the (bounded, top-N) rationale only. An ambiguous signal
  // is always its own singleton cluster; "merge" folds it in.
  const byId = new Map<string, CandidateCluster>();
  for (const c of clusters) byId.set(c.id, c);
  let resolvedMerges = 0;
  for (const amb of ambiguous) {
    const target = byId.get(amb.clusterId);
    if (!target) continue;
    const singleton = [...byId.values()].find(
      (c) => c.signals.length === 1 && c.signals[0]?.id === amb.signalId,
    );
    if (!singleton) continue;
    if (deterministicResolve(amb) !== "merge") continue;
    byId.delete(singleton.id);
    byId.delete(target.id);
    const merged = refinalize([...target.signals, ...singleton.signals]);
    byId.set(merged.id, merged);
    resolvedMerges += 1;
  }

  const scored = [...byId.values()].map((c) =>
    scoreIncident(c, contextFor(contexts, c.neighborhood), now),
  );
  const ranked = rankIncidents(scored);

  // Only the top-N get an LLM rationale (bounded cost/latency — the
  // spec's LLM guardrail), and those run concurrently rather than
  // sequentially. The rest use the instant deterministic narrative.
  const narrateInputs = ranked.map((inc) => ({
    tier: inc.tier,
    factors: inc.factors,
    sourceCount: new Set(inc.cluster.signals.map((s) => s.source)).size,
    neighborhood: inc.cluster.neighborhood,
    affinityGroup: inc.cluster.signals[0]?.affinityGroup ?? "unknown",
    anomalyRatio: anomaly(
      inc.cluster,
      contextFor(contexts, inc.cluster.neighborhood),
    ).ratio,
  }));
  for (let idx = NARRATE_TOP_N; idx < ranked.length; idx += 1) {
    ranked[idx]!.rationale = deterministicNarrate(narrateInputs[idx]!);
  }
  const topCount = Math.min(NARRATE_TOP_N, ranked.length);
  await Promise.all(
    Array.from({ length: topCount }, async (_, idx) => {
      ranked[idx]!.rationale = await input.adjudicator.narrate(
        narrateInputs[idx]!,
      );
    }),
  );

  const pages = buildIncidentPages(ranked, now);
  const byTier: Record<string, number> = {};
  for (const i of ranked) byTier[i.tier] = (byTier[i.tier] ?? 0) + 1;

  return {
    ranked,
    pages,
    stats: {
      liveSignals: live.length,
      clusters: clusters.length,
      ambiguousResolved: resolvedMerges,
      incidents: ranked.length,
      byTier,
    },
  };
}

export interface RunDeps {
  db: Db;
  now: Date;
  adjudicator: Adjudicator;
  logger: Logger;
  windowHours?: number;
}

async function readDatasfRows(
  db: Db,
  now: Date,
): Promise<DatasfBaselineRow[]> {
  const since = new Date(now.getTime() - BASELINE_DAYS * 86_400_000);
  const rows = await db
    .select({
      occurredAt: signalEvents.occurredAt,
      lat: signalEvents.lat,
      lng: signalEvents.lng,
      payload: signalEvents.payload,
    })
    .from(signalEvents)
    .where(
      sql`${signalEvents.sourceType} = 'call_911'
          AND ${signalEvents.payload}->>'feed' = 'datasf_sfpd_incidents'
          AND ${signalEvents.occurredAt} >= ${since.toISOString()}`,
    );
  const out: DatasfBaselineRow[] = [];
  for (const r of rows) {
    const p =
      typeof r.payload === "object" && r.payload !== null
        ? (r.payload as Record<string, unknown>)
        : {};
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    out.push({
      occurredAt: new Date(r.occurredAt).toISOString(),
      lat: r.lat,
      lng: r.lng,
      neighborhood: str(p["neighborhood"]),
      category: str(p["category"]),
      resolution: str(p["resolution"]),
    });
  }
  return out;
}

async function readLiveRows(
  db: Db,
  now: Date,
  hours: number,
): Promise<RawRow[]> {
  const since = new Date(now.getTime() - hours * 3_600_000);
  const rows = await db
    .select({
      id: signalEvents.id,
      sourceType: signalEvents.sourceType,
      occurredAt: signalEvents.occurredAt,
      lat: signalEvents.lat,
      lng: signalEvents.lng,
      payload: signalEvents.payload,
      confidence: signalEvents.confidence,
    })
    .from(signalEvents)
    .where(sql`${signalEvents.occurredAt} >= ${since.toISOString()}`);
  return rows.map((r) => ({
    id: r.id,
    sourceType: r.sourceType,
    occurredAt: new Date(r.occurredAt),
    lat: r.lat,
    lng: r.lng,
    payload: r.payload,
    confidence: r.confidence,
  }));
}

/** IO wrapper: read signal_events, correlate, upsert incident pages. */
export async function runCorrelation(
  deps: RunDeps,
): Promise<CorrelationSummary> {
  const hours = deps.windowHours ?? WINDOW_HOURS;
  const [datasfRows, liveRows] = await Promise.all([
    readDatasfRows(deps.db, deps.now),
    readLiveRows(deps.db, deps.now, hours),
  ]);
  deps.logger.info("Read signal_events", {
    datasfBaselineRows: datasfRows.length,
    liveRows: liveRows.length,
  });

  const { pages, stats } = await correlate({
    datasfRows,
    liveRows,
    now: deps.now,
    adjudicator: deps.adjudicator,
    windowHours: hours,
  });

  const res = await writeIncidentPages(deps.db, pages);
  const summary: CorrelationSummary = {
    ...stats,
    pagesWritten: res.written,
    failures: res.failures,
  };
  deps.logger.info("Correlation complete", summary);
  return summary;
}
