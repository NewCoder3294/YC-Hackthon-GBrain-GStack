// Top-level fan-out for live_incidents sync.
//
// Runs each source in parallel (Promise.allSettled). Per-source freshness
// gating: skips a source if its `last_run_at` in `live_incident_syncs` is
// newer than the source's minimum poll interval. Uses the source's
// `last_high_water_mark` as a `$where` cursor when supported.
//
// Designed to be called by both a Vercel cron route (every 5 min) and
// ad-hoc tests/dev. Pure dependency injection — `db` and `fetch` are
// passed in so vitest can swap them.

import { eq } from "drizzle-orm";
import {
  liveIncidentSyncs,
  type Db,
  type NewLiveIncident,
} from "@caltrans/db";
import { upsertLiveIncidents } from "./live-incidents";

import { fetchSFPDCad, SFPD_CAD_SOURCE } from "./sources/sfpd-cad";
import { fetchFireEMS, FIRE_EMS_SOURCE } from "./sources/fire-ems";
import { fetchSF311, SF_311_SOURCE } from "./sources/sf311";
import { fetchSFPDReports, SFPD_REPORTS_SOURCE } from "./sources/sfpd-reports";
import { fetchTraffic511, TRAFFIC_511_SOURCE } from "./sources/traffic-511";
import { fetchTransit511, TRANSIT_511_SOURCE } from "./sources/transit-511";
import { fetchPGEOutages, PGE_OUTAGES_SOURCE } from "./sources/pge-outages";

export type SourceId =
  | typeof SFPD_CAD_SOURCE
  | typeof FIRE_EMS_SOURCE
  | typeof SF_311_SOURCE
  | typeof SFPD_REPORTS_SOURCE
  | typeof TRAFFIC_511_SOURCE
  | typeof TRANSIT_511_SOURCE
  | typeof PGE_OUTAGES_SOURCE;

export interface SourceConfig {
  id: SourceId;
  /** Minimum interval between successful polls (ms). */
  minIntervalMs: number;
  /** Whether this source supports `since` incremental polling. */
  incremental: boolean;
}

export const SOURCE_CONFIGS: Record<SourceId, SourceConfig> = {
  [SFPD_CAD_SOURCE]: { id: SFPD_CAD_SOURCE, minIntervalMs: 15 * 60_000, incremental: true },
  [FIRE_EMS_SOURCE]: { id: FIRE_EMS_SOURCE, minIntervalMs: 6 * 60 * 60_000, incremental: true },
  [SF_311_SOURCE]: { id: SF_311_SOURCE, minIntervalMs: 6 * 60 * 60_000, incremental: true },
  [SFPD_REPORTS_SOURCE]: {
    id: SFPD_REPORTS_SOURCE,
    minIntervalMs: 24 * 60 * 60_000,
    incremental: true,
  },
  [TRAFFIC_511_SOURCE]: { id: TRAFFIC_511_SOURCE, minIntervalMs: 5 * 60_000, incremental: false },
  [TRANSIT_511_SOURCE]: { id: TRANSIT_511_SOURCE, minIntervalMs: 5 * 60_000, incremental: false },
  [PGE_OUTAGES_SOURCE]: { id: PGE_OUTAGES_SOURCE, minIntervalMs: 10 * 60_000, incremental: false },
};

export interface OrchestrateDeps {
  db: Db;
  fetch: typeof globalThis.fetch;
  sf511ApiKey: string | undefined;
  socrataAppToken?: string;
  now?: () => Date;
  /** Restrict to a subset of sources (default: all). */
  sources?: SourceId[];
  /** Skip freshness check (always poll). */
  force?: boolean;
}

export interface SourceResult {
  source: SourceId;
  status: "ok" | "skipped" | "error";
  upserted: number;
  error?: string;
  highWaterMark?: string | null;
  durationMs: number;
}

export interface OrchestrateResult {
  ok: boolean;
  ranAt: string;
  sources: SourceResult[];
}

interface FetchResult {
  rows: NewLiveIncident[];
  highWaterMark: Date | null;
}

async function runSource(
  source: SourceId,
  deps: OrchestrateDeps,
  since: string | undefined,
): Promise<FetchResult> {
  const socrataDeps = {
    fetch: deps.fetch,
    ...(deps.socrataAppToken ? { appToken: deps.socrataAppToken } : {}),
  };
  const sinceOpt = since ? { since } : {};
  switch (source) {
    case SFPD_CAD_SOURCE:
      return fetchSFPDCad(socrataDeps, sinceOpt);
    case FIRE_EMS_SOURCE:
      return fetchFireEMS(socrataDeps, sinceOpt);
    case SF_311_SOURCE:
      return fetchSF311(socrataDeps, sinceOpt);
    case SFPD_REPORTS_SOURCE:
      return fetchSFPDReports(socrataDeps, sinceOpt);
    case TRAFFIC_511_SOURCE: {
      if (!deps.sf511ApiKey) throw new Error("SF_511_API_KEY not set");
      return fetchTraffic511({ fetch: deps.fetch, apiKey: deps.sf511ApiKey });
    }
    case TRANSIT_511_SOURCE: {
      if (!deps.sf511ApiKey) throw new Error("SF_511_API_KEY not set");
      return fetchTransit511({ fetch: deps.fetch, apiKey: deps.sf511ApiKey });
    }
    case PGE_OUTAGES_SOURCE:
      return fetchPGEOutages({ fetch: deps.fetch });
  }
}

async function recordSyncOutcome(
  db: Db,
  source: SourceId,
  outcome: {
    runAt: Date;
    status: "ok" | "error";
    error?: string;
    rowsUpserted: number;
    highWaterMark?: Date | null;
  },
): Promise<void> {
  await db
    .insert(liveIncidentSyncs)
    .values({
      source,
      lastRunAt: outcome.runAt,
      lastStatus: outcome.status,
      lastError: outcome.error ?? null,
      rowsUpserted: outcome.rowsUpserted,
      lastHighWaterMark: outcome.highWaterMark ?? null,
    })
    .onConflictDoUpdate({
      target: liveIncidentSyncs.source,
      set: {
        lastRunAt: outcome.runAt,
        lastStatus: outcome.status,
        lastError: outcome.error ?? null,
        rowsUpserted: outcome.rowsUpserted,
        // Preserve prior high water mark on error or when source didn't move it.
        ...(outcome.highWaterMark
          ? { lastHighWaterMark: outcome.highWaterMark }
          : {}),
      },
    });
}

async function processSource(
  source: SourceId,
  deps: OrchestrateDeps,
  now: Date,
): Promise<SourceResult> {
  const cfg = SOURCE_CONFIGS[source];
  const started = Date.now();

  const existing = await deps.db
    .select()
    .from(liveIncidentSyncs)
    .where(eq(liveIncidentSyncs.source, source))
    .limit(1);
  const prior = existing[0];

  if (!deps.force && prior) {
    const ageMs = now.getTime() - new Date(prior.lastRunAt).getTime();
    if (ageMs < cfg.minIntervalMs) {
      return {
        source,
        status: "skipped",
        upserted: 0,
        durationMs: Date.now() - started,
      };
    }
  }

  const since =
    cfg.incremental && prior?.lastHighWaterMark
      ? new Date(prior.lastHighWaterMark).toISOString()
      : undefined;

  try {
    const { rows, highWaterMark } = await runSource(source, deps, since);
    const upserted = await upsertLiveIncidents(deps.db, rows);
    await recordSyncOutcome(deps.db, source, {
      runAt: now,
      status: "ok",
      rowsUpserted: upserted,
      highWaterMark,
    });
    return {
      source,
      status: "ok",
      upserted,
      highWaterMark: highWaterMark?.toISOString() ?? null,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncOutcome(deps.db, source, {
      runAt: now,
      status: "error",
      error: message,
      rowsUpserted: 0,
    });
    return {
      source,
      status: "error",
      upserted: 0,
      error: message,
      durationMs: Date.now() - started,
    };
  }
}

export async function syncLiveIncidents(
  deps: OrchestrateDeps,
): Promise<OrchestrateResult> {
  const now = deps.now ? deps.now() : new Date();
  const sources = deps.sources ?? (Object.keys(SOURCE_CONFIGS) as SourceId[]);
  const results = await Promise.all(
    sources.map((s) => processSource(s, deps, now)),
  );
  return {
    ok: results.every((r) => r.status !== "error"),
    ranAt: now.toISOString(),
    sources: results,
  };
}
