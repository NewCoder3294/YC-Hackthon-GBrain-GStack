/**
 * Neighborhood-baseline rollup worker.
 *
 *   pnpm --filter @caltrans/ingestion baseline [--days N] [--top N]
 *
 * Reads datasf rows from signal_events (payload.feed =
 * 'datasf_sfpd_incidents'), aggregates per analysis_neighborhood, and
 * upserts GBrain baseline/rollup/disparity pages. IO shell only — logic
 * is in metrics.ts / pages.ts (mirrors datasf/run.ts).
 */

import "../load-env";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { signalEvents, type Db } from "@caltrans/db";
import { dbFromEnv } from "../db";
import { createLogger } from "../logger";
import { aggregate, type IncidentRow } from "./metrics";
import { buildPages } from "./pages";
import { writePages } from "./gbrain-writer";

const log = createLogger("baseline");

interface CliArgs {
  daysBack: number;
  topN: number;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const num = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    if (i === -1) return fallback;
    const n = Number(argv[i + 1]);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`${flag} requires a positive number`);
    }
    return n;
  };
  return { daysBack: num("--days", 400), topN: num("--top", 10) };
}

function toIncidentRow(p: unknown, occurredAt: Date): IncidentRow | null {
  if (typeof p !== "object" || p === null) return null;
  const o = p as Record<string, unknown>;
  if (o["feed"] !== "datasf_sfpd_incidents") return null;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    occurredAt: occurredAt.toISOString(),
    neighborhood: str(o["neighborhood"]),
    category: str(o["category"]),
    resolution: str(o["resolution"]),
  };
}

async function readDatasfRows(
  db: Db,
  daysBack: number,
): Promise<IncidentRow[]> {
  const since = new Date(Date.now() - daysBack * 86_400_000);
  const rows = await db
    .select({
      occurredAt: signalEvents.occurredAt,
      payload: signalEvents.payload,
    })
    .from(signalEvents)
    .where(
      sql`${signalEvents.sourceType} = 'call_911'
          AND ${signalEvents.payload}->>'feed' = 'datasf_sfpd_incidents'
          AND ${signalEvents.occurredAt} >= ${since.toISOString()}`,
    );
  const out: IncidentRow[] = [];
  for (const r of rows) {
    const ir = toIncidentRow(r.payload, new Date(r.occurredAt));
    if (ir !== null) out.push(ir);
  }
  return out;
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

  const now = new Date();
  const db = dbFromEnv();

  let rows: IncidentRow[];
  try {
    rows = await readDatasfRows(db, args.daysBack);
  } catch (err: unknown) {
    log.error("Failed reading signal_events", {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
    return;
  }

  if (rows.length === 0) {
    log.info(
      "No datasf rows in signal_events — run " +
        "`pnpm --filter @caltrans/ingestion datasf --backfill` first",
    );
    return;
  }

  const agg = aggregate(rows, now);
  const pages = buildPages(agg, now, args.topN);
  log.info("Aggregated", {
    incidents: agg.totalIncidents,
    neighborhoods: agg.neighborhoods.length,
    unknown: agg.unknownCount,
    pages: pages.length,
  });

  const res = await writePages(db, pages);
  log.info("Baseline rollup complete", {
    pagesWritten: res.written,
    failures: res.failures.length,
    failed: res.failures,
  });
  if (res.failures.length > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined) {
  const thisFile = fileURLToPath(import.meta.url);
  if (resolve(invokedPath) === thisFile) {
    void main();
  }
}
