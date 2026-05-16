/**
 * Public exports — re-exported so callers (Vercel cron route, scripts in
 * other packages) can import the worker primitives without reaching into
 * `src/*` paths directly.
 */

export { runTick } from "./tick";
export type { TickResult } from "./tick";
export { fuseRecent, clusterSignals, severityFor, haversineMeters } from "./fusion";
export type { FusionCluster, FusionEvent, FusionOptions } from "./fusion";
export { postIngest } from "./ingest";
export type { IngestRequest, IngestResponse } from "./ingest";
export { putGbrainPage, putPatternPage, putIntelNotePage } from "./gbrain";
export { SCENARIOS, pickScenario, scenarioToIngestRequest } from "./scenarios";
export type { Scenario } from "./scenarios";
export { getConfig } from "./config";
export { closeDb } from "./db";
