/**
 * Signal correlator + incident ranker worker.
 *
 *   pnpm --filter @caltrans/ingestion correlate [--window-hours N]
 *
 * Reads the live signal_events window (+ DataSF baseline), correlates
 * multi-source signals into incidents, ranks them, and upserts GBrain
 * incident pages. IO shell only — logic is in pipeline.ts (mirrors
 * baseline/run.ts).
 */

import "../load-env";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { dbFromEnv } from "../db";
import { createLogger } from "../logger";
import { createAdjudicator } from "./adjudicate";
import { runCorrelation } from "./pipeline";
import { WINDOW_HOURS } from "./config";

const log = createLogger("correlate");

export interface CliArgs {
  windowHours: number;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const i = argv.indexOf("--window-hours");
  if (i === -1) return { windowHours: WINDOW_HOURS };
  const n = Number(argv[i + 1]);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("--window-hours requires a positive number");
  }
  return { windowHours: n };
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

  const db = dbFromEnv();
  const adjudicator = createAdjudicator({});

  try {
    const summary = await runCorrelation({
      db,
      now: new Date(),
      adjudicator,
      logger: log,
      windowHours: args.windowHours,
    });
    if (summary.failures.length > 0) process.exitCode = 1;
  } catch (err: unknown) {
    log.error("Correlation failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined) {
  const thisFile = fileURLToPath(import.meta.url);
  if (resolve(invokedPath) === thisFile) {
    void main();
  }
}
