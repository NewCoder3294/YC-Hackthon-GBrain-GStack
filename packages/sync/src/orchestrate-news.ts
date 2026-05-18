// News-RSS orchestrator.
//
// Distinct from `syncLiveIncidents` because news writes to a different
// table (`news_incidents`) with a different upsert key (`source_url`).
// We still record per-source bookkeeping in `live_incident_syncs` so
// every ingest path shares one operational dashboard — the table is
// schema-light enough that a non-live_incidents source isn't a stretch.

import { eq } from "drizzle-orm";
import { liveIncidentSyncs, type Db } from "@caltrans/db";
import { upsertNewsIncidents } from "./news-incidents";
import {
  fetchNewsRss,
  NEWS_RSS_SOURCE,
  type RssFeedDef,
} from "./sources/news-rss";

export interface OrchestrateNewsDeps {
  db: Db;
  fetch: typeof globalThis.fetch;
  /** Override the default feed list (tests). */
  feeds?: RssFeedDef[];
  /** Minimum interval between polls (ms). Default 30 min. */
  minIntervalMs?: number;
  /** Skip the freshness gate. */
  force?: boolean;
  /** Override the current time (tests). */
  now?: () => Date;
}

export interface OrchestrateNewsResult {
  ok: boolean;
  status: "ok" | "skipped" | "error";
  ranAt: string;
  upserted: number;
  error?: string;
  highWaterMark?: string | null;
  durationMs: number;
}

const DEFAULT_MIN_INTERVAL_MS = 30 * 60_000;

export async function syncNewsIncidents(
  deps: OrchestrateNewsDeps,
): Promise<OrchestrateNewsResult> {
  const now = deps.now ? deps.now() : new Date();
  const started = Date.now();
  const minInterval = deps.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;

  const existing = await deps.db
    .select()
    .from(liveIncidentSyncs)
    .where(eq(liveIncidentSyncs.source, NEWS_RSS_SOURCE))
    .limit(1);
  const prior = existing[0];

  if (!deps.force && prior) {
    const ageMs = now.getTime() - new Date(prior.lastRunAt).getTime();
    if (ageMs < minInterval) {
      return {
        ok: true,
        status: "skipped",
        ranAt: now.toISOString(),
        upserted: 0,
        durationMs: Date.now() - started,
      };
    }
  }

  const since = prior?.lastHighWaterMark
    ? new Date(prior.lastHighWaterMark).toISOString()
    : undefined;

  try {
    const result = await fetchNewsRss(
      {
        fetch: deps.fetch,
        ...(deps.feeds ? { feeds: deps.feeds } : {}),
      },
      since ? { since } : {},
    );
    const upserted = await upsertNewsIncidents(deps.db, result.rows);
    await deps.db
      .insert(liveIncidentSyncs)
      .values({
        source: NEWS_RSS_SOURCE,
        lastRunAt: now,
        lastStatus: "ok",
        lastError: null,
        rowsUpserted: upserted,
        lastHighWaterMark: result.highWaterMark ?? null,
      })
      .onConflictDoUpdate({
        target: liveIncidentSyncs.source,
        set: {
          lastRunAt: now,
          lastStatus: "ok",
          lastError: null,
          rowsUpserted: upserted,
          ...(result.highWaterMark
            ? { lastHighWaterMark: result.highWaterMark }
            : {}),
        },
      });
    return {
      ok: true,
      status: "ok",
      ranAt: now.toISOString(),
      upserted,
      highWaterMark: result.highWaterMark?.toISOString() ?? null,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.db
      .insert(liveIncidentSyncs)
      .values({
        source: NEWS_RSS_SOURCE,
        lastRunAt: now,
        lastStatus: "error",
        lastError: message,
        rowsUpserted: 0,
      })
      .onConflictDoUpdate({
        target: liveIncidentSyncs.source,
        set: {
          lastRunAt: now,
          lastStatus: "error",
          lastError: message,
          rowsUpserted: 0,
        },
      });
    return {
      ok: false,
      status: "error",
      ranAt: now.toISOString(),
      upserted: 0,
      error: message,
      durationMs: Date.now() - started,
    };
  }
}
