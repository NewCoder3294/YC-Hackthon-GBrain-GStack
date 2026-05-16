import "./load-env";
import { getConfig } from "./config";
import { log } from "./logger";
import { closeDb } from "./db";
import { runTick } from "./tick";

/**
 * Long-running worker loop. Calls `runTick` every INTERVAL_S seconds.
 *
 * Run with:  pnpm --filter @caltrans/openclaw-worker worker
 */

let stopping = false;
const stopSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const sig of stopSignals) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    log.info({ scope: "worker", msg: `caught ${sig}, shutting down`, extra: {} });
  });
}

async function main() {
  const cfg = getConfig();
  log.info({
    scope: "worker",
    msg: "starting OpenClaw worker",
    extra: {
      mode: cfg.WORKER_MODE,
      interval_s: cfg.INTERVAL_S,
      fusion_window_s: cfg.FUSION_WINDOW_S,
      fusion_radius_m: cfg.FUSION_RADIUS_M,
      ingest_url: cfg.INGEST_URL,
      gbrain_pages_enabled: cfg.GBRAIN_PAGES_ENABLED,
    },
  });

  while (!stopping) {
    const tickStart = Date.now();
    try {
      const result = await runTick();
      log.info({
        scope: "worker",
        msg: "tick complete",
        extra: { ...result, took_ms: Date.now() - tickStart },
      });
    } catch (err) {
      log.error({
        scope: "worker",
        msg: "tick failed",
        extra: { err: err instanceof Error ? err.message : String(err) },
      });
    }

    if (stopping) break;
    await sleep(cfg.INTERVAL_S * 1000);
  }

  await closeDb();
  log.info({ scope: "worker", msg: "exited", extra: {} });
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // Don't keep the event loop alive — let SIGINT during sleep terminate cleanly.
    t.unref?.();
    const onStop = () => {
      clearTimeout(t);
      resolve();
    };
    for (const sig of stopSignals) process.once(sig, onStop);
  });
}

main().catch((err) => {
  log.error({
    scope: "worker",
    msg: "fatal",
    extra: { err: err instanceof Error ? err.message : String(err) },
  });
  process.exit(1);
});
