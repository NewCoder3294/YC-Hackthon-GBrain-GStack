/**
 * Caltrans public-camera detector worker (TRD §2 / §3.1, Hari's track).
 *
 * Long-running CLI. For each pinned SF camera, every ~2s (staggered so
 * cameras don't all hit ffmpeg at once), it:
 *   grabFrame → detectObjects → if anything detected, write a
 *   `signal_events` row via the shared `insertSignalEvents` contract.
 *
 * Per-camera try/catch: one dead stream or model hiccup can never kill
 * the loop. Demo deliverable: a real Caltrans camera producing
 * signal_events within the first minute.
 *
 * Env:
 *   DATABASE_URL    (required — see db.ts)
 *   CAMERA_PIN_IDS  comma list of Caltrans ids to force-pin (optional)
 *   CAMERA_POLL_MS  per-camera poll interval, ms (default 2000)
 *   FFMPEG_PATH     ffmpeg binary override (see frame.ts)
 */

import "../load-env";
import type { Db } from "@caltrans/db";
import { createLogger, type Logger } from "../logger";
import { dbFromEnv } from "../db";
import { insertSignalEvents, type SignalEventInput } from "../signal-events";
import { selectPinnedCameras, type PinnedCamera } from "./pins";
import { grabFrame } from "./frame";
import { detectObjects, type Detection } from "./detect";

const DEFAULT_POLL_MS = 2_000;

export interface RunConfig {
  readonly pinIds: readonly string[] | undefined;
  readonly pollMs: number;
}

/** Parse the worker config from environment. Exported for tests. */
export function configFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RunConfig {
  const rawIds = (env.CAMERA_PIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const pinIds = rawIds.length > 0 ? rawIds : undefined;

  const rawPoll = Number(env.CAMERA_POLL_MS);
  const pollMs =
    Number.isFinite(rawPoll) && rawPoll > 0 ? rawPoll : DEFAULT_POLL_MS;

  return { pinIds, pollMs };
}

/**
 * Pure mapper: a camera + its non-empty detections → a SignalEventInput.
 * Exported and dependency-free so the row shape is unit-tested without
 * ffmpeg, the model, or a DB. Returns null when there is nothing to emit.
 */
export function buildCameraSignalEvent(
  camera: PinnedCamera,
  detections: readonly Detection[],
  frameAt: Date,
): SignalEventInput | null {
  if (detections.length === 0) return null;

  const maxScore = detections.reduce(
    (max, d) => (d.score > max ? d.score : max),
    0,
  );

  return {
    sourceType: "camera_public",
    sourceId: camera.caltransId,
    occurredAt: frameAt,
    lat: camera.lat,
    lng: camera.lng,
    payload: {
      camera: camera.description,
      streamUrl: camera.streamUrl,
      detections: detections.map((d) => ({
        label: d.label,
        score: d.score,
        box: d.box,
      })),
      frameAt: frameAt.toISOString(),
    },
    confidence: maxScore,
    rawClipUri: camera.streamUrl,
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

interface WatchDeps {
  readonly db: Db;
  readonly log: Logger;
  readonly grab: typeof grabFrame;
  readonly detect: typeof detectObjects;
}

/** One camera's processing tick. All failure modes are contained here. */
async function tickCamera(
  camera: PinnedCamera,
  deps: WatchDeps,
): Promise<void> {
  try {
    const jpeg = await deps.grab(camera.streamUrl);
    const frameAt = new Date();
    const detections = await deps.detect(jpeg);

    const event = buildCameraSignalEvent(camera, detections, frameAt);
    if (event === null) {
      deps.log.info("frame clear", {
        camera: camera.caltransId,
        bytes: jpeg.length,
      });
      return;
    }

    const ids = await insertSignalEvents(deps.db, [event]);
    deps.log.info("signal_event written", {
      camera: camera.caltransId,
      count: detections.length,
      confidence: event.confidence,
      ids,
    });
  } catch (err: unknown) {
    deps.log.error("camera tick failed", {
      camera: camera.caltransId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Continuously poll one camera on its own staggered schedule. */
async function watchCamera(
  camera: PinnedCamera,
  pollMs: number,
  staggerMs: number,
  deps: WatchDeps,
  shouldStop: () => boolean,
): Promise<void> {
  await sleep(staggerMs);
  while (!shouldStop()) {
    const startedAt = Date.now();
    await tickCamera(camera, deps);
    const elapsed = Date.now() - startedAt;
    const wait = pollMs - elapsed;
    if (wait > 0) await sleep(wait);
  }
}

export interface MainDeps {
  readonly db: Db;
  readonly fetch: typeof globalThis.fetch;
  readonly log: Logger;
  readonly grab?: typeof grabFrame;
  readonly detect?: typeof detectObjects;
  /** Stop predicate for tests / graceful shutdown. Default: never stop. */
  readonly shouldStop?: () => boolean;
}

/** Wire up deps, select pins, and watch them concurrently (staggered). */
export async function main(
  config: RunConfig,
  deps: MainDeps,
): Promise<void> {
  const log = deps.log;
  log.info("starting camera detector", {
    pinIds: config.pinIds ?? null,
    pollMs: config.pollMs,
  });

  const cameras = await selectPinnedCameras(
    { db: deps.db, fetch: deps.fetch },
    config.pinIds ? { caltransIds: config.pinIds } : {},
  );

  if (cameras.length === 0) {
    log.error("no SF cameras selected — nothing to watch", {});
    return;
  }

  log.info("watching cameras", {
    count: cameras.length,
    cameras: cameras.map((c) => c.caltransId),
  });

  const watchDeps: WatchDeps = {
    db: deps.db,
    log,
    grab: deps.grab ?? grabFrame,
    detect: deps.detect ?? detectObjects,
  };
  const shouldStop = deps.shouldStop ?? (() => false);
  const stagger = Math.floor(config.pollMs / cameras.length);

  await Promise.all(
    cameras.map((cam, i) =>
      watchCamera(cam, config.pollMs, stagger * i, watchDeps, shouldStop),
    ),
  );
}

/** CLI entrypoint (`pnpm --filter @caltrans/ingestion camera`). */
async function cli(): Promise<void> {
  const log = createLogger("camera");
  try {
    const config = configFromEnv();
    const db = dbFromEnv();
    await main(config, { db, fetch: globalThis.fetch, log });
  } catch (err: unknown) {
    log.error("fatal", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  }
}

// Run only when executed directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  void cli();
}
