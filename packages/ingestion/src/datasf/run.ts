/**
 * DataSF SFPD Incident Reports worker (4th Layer-1 producer).
 *
 * Standalone Node process (run via `pnpm --filter @caltrans/ingestion
 * datasf`). Pulls confirmed SFPD incident reports from Socrata and writes
 * them to `signal_events` — doubling as a live-ish feed AND the historical
 * baseline/seed data the GBrain/equity layer needs.
 *
 * Modes:
 *   --backfill   Pull a large historical window (DATASF_BACKFILL_DAYS,
 *                default 365) for neighborhood baselines.
 *   --recent     Poll the most recent window (DATASF_RECENT_HOURS,
 *                default 24) for a live-ish feed.
 *   --days N     Override the window with N days (works with either mode).
 *
 * Idempotent: dedupes on source_id = row_id against rows already in
 * signal_events, so re-runs never duplicate.
 *
 * IO shell only — all testable logic is in mapper.ts / client.ts.
 */

import "../load-env";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { signalEvents, type Db } from "@caltrans/db";
import { inArray } from "drizzle-orm";
import { dbFromEnv } from "../db";
import { createLogger } from "../logger";
import { insertSignalEvents, type SignalEventInput } from "../signal-events";
import {
  fetchIncidents,
  socrataSince,
  RateLimitedError,
} from "./client";
import { mapIncidents, partitionNew, DATASF_SOURCE_TYPE } from "./mapper";

const log = createLogger("datasf");

type Mode = "backfill" | "recent";

interface CliArgs {
  readonly mode: Mode;
  readonly daysOverride?: number;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const mode: Mode | undefined = argv.includes("--backfill")
    ? "backfill"
    : argv.includes("--recent")
      ? "recent"
      : undefined;
  if (mode === undefined) {
    throw new Error(
      "Usage: datasf --backfill | --recent  [--days N]  " +
        "(--backfill = historical baseline window; --recent = live-ish poll)",
    );
  }
  const dIdx = argv.indexOf("--days");
  if (dIdx !== -1) {
    const n = Number(argv[dIdx + 1]);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("--days requires a positive number");
    }
    return { mode, daysOverride: n };
  }
  return { mode };
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

interface RunConfig {
  readonly sinceIso: string;
  readonly pageLimit: number;
  readonly maxRows: number;
  readonly throttleMs: number;
  readonly appToken: string | undefined;
}

export function configForMode(args: CliArgs, now: Date): RunConfig {
  const windowDays =
    args.daysOverride ??
    (args.mode === "backfill"
      ? intEnv("DATASF_BACKFILL_DAYS", 365)
      : intEnv("DATASF_RECENT_HOURS", 24) / 24);
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return {
    sinceIso: socrataSince(since),
    pageLimit: intEnv("DATASF_PAGE_LIMIT", 1000),
    maxRows: intEnv(
      "DATASF_MAX_ROWS",
      args.mode === "backfill" ? 50000 : 5000,
    ),
    throttleMs: intEnv("DATASF_THROTTLE_MS", 250),
    appToken: process.env.DATASF_APP_TOKEN || undefined,
  };
}

const ID_QUERY_CHUNK = 1000;
const INSERT_CHUNK = 500;

/** Existing source_ids among `ids` already in signal_events (chunked). */
async function existingSourceIds(
  db: Db,
  ids: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += ID_QUERY_CHUNK) {
    const chunk = ids.slice(i, i + ID_QUERY_CHUNK);
    const rows = await db
      .select({ sourceId: signalEvents.sourceId })
      .from(signalEvents)
      .where(inArray(signalEvents.sourceId, chunk));
    for (const r of rows) found.add(r.sourceId);
  }
  return found;
}

async function insertChunked(
  db: Db,
  events: readonly SignalEventInput[],
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < events.length; i += INSERT_CHUNK) {
    const ids = await insertSignalEvents(db, events.slice(i, i + INSERT_CHUNK));
    inserted += ids.length;
  }
  return inserted;
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err: unknown) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  const cfg = configForMode(args, new Date());
  log.info("Starting DataSF ingest", {
    mode: args.mode,
    since: cfg.sinceIso,
    maxRows: cfg.maxRows,
    pageLimit: cfg.pageLimit,
    sourceType: DATASF_SOURCE_TYPE,
    hasAppToken: cfg.appToken !== undefined,
  });

  let raw: unknown[];
  try {
    raw = await fetchIncidents(
      { fetch: globalThis.fetch, appToken: cfg.appToken },
      {
        sinceIso: cfg.sinceIso,
        pageLimit: cfg.pageLimit,
        maxRows: cfg.maxRows,
        throttleMs: cfg.throttleMs,
      },
    );
  } catch (err: unknown) {
    if (err instanceof RateLimitedError) {
      log.error("Socrata rate limit exhausted — set DATASF_APP_TOKEN", {
        message: err.message,
      });
    } else {
      log.error("DataSF fetch failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    process.exitCode = 1;
    return;
  }

  const { events, skipped } = mapIncidents(raw);
  log.info("Mapped rows", {
    fetched: raw.length,
    mapped: events.length,
    skippedNoGeoOrBad: skipped,
  });
  if (events.length === 0) {
    log.info("Nothing to ingest");
    return;
  }

  const db = dbFromEnv();
  let inserted = 0;
  let duplicates = 0;
  try {
    const existing = await existingSourceIds(
      db,
      events.map((e) => e.sourceId),
    );
    const part = partitionNew(events, existing);
    duplicates = part.duplicates;
    inserted = await insertChunked(db, part.fresh);
  } catch (err: unknown) {
    log.error("DataSF DB write failed", {
      message: err instanceof Error ? err.message : String(err),
      insertedBeforeFailure: inserted,
    });
    process.exitCode = 1;
    return;
  }

  log.info("DataSF ingest complete", {
    mode: args.mode,
    fetched: raw.length,
    mapped: events.length,
    skippedNoGeoOrBad: skipped,
    duplicatesSkipped: duplicates,
    inserted,
  });
}

// Entrypoint guard — run only when executed directly, not when imported
// by tests (ESM-safe require.main === module; mirrors calls/run.ts).
const invokedPath = process.argv[1];
if (invokedPath !== undefined) {
  const thisFile = fileURLToPath(import.meta.url);
  if (resolve(invokedPath) === thisFile) {
    void main();
  }
}
