/**
 * 911 transcript generator worker (TRD §6 / §8).
 *
 * A standalone Node process (run via `pnpm --filter @caltrans/ingestion
 * calls`). It does NOT consume a real 911 feed — none exists publicly —
 * it replays a scripted SF timeline so the operator can demo the
 * correlator reacting to incoming calls.
 *
 * Modes:
 *   --all              Play the full scripted timeline in order.
 *                      CALLS_SPEED=N (env) compresses it N× so a ~3-min
 *                      script fits a live demo (e.g. CALLS_SPEED=10).
 *   --id <scenarioId>  Fire exactly ONE scenario immediately and exit.
 *                      Lets Hari trigger "one scripted 911 on cue".
 *
 * Each fired call: summarize → toSignalEvent → insertSignalEvents.
 * Every call is wrapped in its own try/catch so one bad call (DB blip,
 * etc.) never aborts the rest of the demo timeline.
 *
 * This file is the IO shell; all testable logic lives in generator.ts /
 * summarize.ts / scenarios.ts.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { dbFromEnv } from "../db";
import { createLogger } from "../logger";
import { insertSignalEvents } from "../signal-events";
import { SCENARIOS, findScenario, type Scenario } from "./scenarios";
import { scheduleScenarios, toSignalEvent } from "./generator";
import { summarizeTranscript } from "./summarize";

const log = createLogger("calls");

interface CliArgs {
  mode: "all" | "id";
  scenarioId?: string;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  if (argv.includes("--all")) return { mode: "all" };
  const idIdx = argv.indexOf("--id");
  if (idIdx !== -1) {
    const scenarioId = argv[idIdx + 1];
    if (scenarioId === undefined || scenarioId.startsWith("--")) {
      throw new Error("--id requires a scenario id, e.g. --id <scenarioId>");
    }
    return { mode: "id", scenarioId };
  }
  throw new Error(
    "Usage: calls --all  (full timeline; set CALLS_SPEED to compress) " +
      "| calls --id <scenarioId>  (fire one call now). " +
      `Known ids: ${SCENARIOS.map((s) => s.id).join(", ")}`,
  );
}

function parseSpeed(raw: string | undefined): number {
  if (raw === undefined || raw.length === 0) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    log.warn("Invalid CALLS_SPEED — defaulting to 1", { raw });
    return 1;
  }
  return n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Summarize + map + insert a single scenario. Never throws. */
async function fireScenario(
  scenario: Scenario,
  occurredAt: Date,
): Promise<void> {
  try {
    const summary = await summarizeTranscript(scenario.transcript);
    const event = toSignalEvent(scenario, summary, occurredAt);
    const ids = await insertSignalEvents(dbFromEnv(), [event]);
    log.info("911 call ingested", {
      id: scenario.id,
      signalEventId: ids[0] ?? null,
      summary: summary.summary,
      fromModel: summary.fromModel,
      callerHungUp: scenario.callerHungUp,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Failed to ingest 911 call — skipping", {
      id: scenario.id,
      message,
    });
  }
}

async function runAll(speed: number): Promise<void> {
  const startAt = new Date();
  const scheduled = scheduleScenarios(SCENARIOS, startAt, speed);
  log.info("Playing scripted 911 timeline", {
    count: scheduled.length,
    speed,
    spanSeconds:
      scheduled.length > 0
        ? (scheduled[scheduled.length - 1]!.fireAt.getTime() -
            startAt.getTime()) /
          1000
        : 0,
  });

  let prev = startAt.getTime();
  for (const { scenario, fireAt } of scheduled) {
    await sleep(fireAt.getTime() - prev);
    prev = fireAt.getTime();
    // occurredAt = real fire moment, so the correlator sees a live stream.
    await fireScenario(scenario, new Date());
  }
  log.info("Timeline complete", { count: scheduled.length });
}

async function runOne(scenarioId: string): Promise<void> {
  const scenario = findScenario(scenarioId);
  if (scenario === undefined) {
    log.error("Unknown scenario id", {
      scenarioId,
      known: SCENARIOS.map((s) => s.id),
    });
    process.exitCode = 1;
    return;
  }
  log.info("Firing single 911 call on cue", { id: scenario.id });
  await fireScenario(scenario, new Date());
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

  if (args.mode === "all") {
    await runAll(parseSpeed(process.env.CALLS_SPEED));
    return;
  }
  // mode === "id": scenarioId is guaranteed defined by parseArgs.
  await runOne(args.scenarioId as string);
}

// Entrypoint guard: run only when executed directly, not when imported by
// tests. The ESM-safe equivalent of `require.main === module`. We resolve
// both sides to absolute paths because `process.argv[1]` may be relative
// (and is rewritten by tsx), while import.meta.url is an absolute file URL.
const invokedPath = process.argv[1];
if (invokedPath !== undefined) {
  const thisFile = fileURLToPath(import.meta.url);
  if (resolve(invokedPath) === thisFile) {
    void main();
  }
}
