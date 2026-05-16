/**
 * Single-frame grabber. Pipes a live Caltrans HLS (or MJPEG) stream
 * through ffmpeg and resolves the first decoded video frame as a JPEG
 * Buffer. The detector (detect.ts) feeds that buffer to the model.
 *
 * ffmpeg is installed via Homebrew but is frequently NOT on a spawned
 * Node process's PATH, so we resolve a concrete binary path from
 * FFMPEG_PATH, then /opt/homebrew/bin/ffmpeg, then bare `ffmpeg`.
 *
 * The spawn fn is injectable so tests never touch a real process.
 */

import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { existsSync } from "node:fs";

const HOMEBREW_FFMPEG = "/opt/homebrew/bin/ffmpeg";

/** Resolve the ffmpeg binary. Env override wins; then Homebrew; then PATH. */
export function resolveFfmpegPath(): string {
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (existsSync(HOMEBREW_FFMPEG)) return HOMEBREW_FFMPEG;
  return "ffmpeg";
}

/**
 * Build the ffmpeg argv that grabs exactly one JPEG frame to stdout.
 * Pure + exported so the arg shape is unit-tested without spawning.
 */
export function buildFfmpegArgs(streamUrl: string): string[] {
  return [
    "-y",
    "-loglevel",
    "error",
    "-i",
    streamUrl,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "pipe:1",
  ];
}

/** Minimal injectable spawn signature (subset of node:child_process). */
export type SpawnFn = (
  command: string,
  args: readonly string[],
) => ChildProcessWithoutNullStreams;

export interface GrabFrameDeps {
  readonly spawn?: SpawnFn;
  readonly ffmpegPath?: string;
  /** Hard timeout in ms before the ffmpeg child is killed. Default 15000. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Grab one JPEG frame from a stream URL. Resolves a non-empty Buffer or
 * rejects (bad stream, ffmpeg missing, timeout, empty output). Callers
 * (run.ts) wrap this per-camera so one bad stream never kills the loop.
 */
export function grabFrame(
  streamUrl: string,
  deps: GrabFrameDeps = {},
): Promise<Buffer> {
  const spawn = deps.spawn ?? (nodeSpawn as unknown as SpawnFn);
  const bin = deps.ffmpegPath ?? resolveFfmpegPath();
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = buildFfmpegArgs(streamUrl);

  return new Promise<Buffer>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(bin, args);
    } catch (err: unknown) {
      reject(new Error(`failed to spawn ffmpeg (${bin}): ${describe(err)}`));
      return;
    }

    const chunks: Buffer[] = [];
    const stderr: string[] = [];
    let settled = false;

    const finish = (
      action: () => void,
      killAfter: boolean = false,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killAfter) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* child already gone — nothing to do */
        }
      }
      action();
    };

    const timer = setTimeout(() => {
      finish(
        () =>
          reject(
            new Error(`ffmpeg timed out after ${timeoutMs}ms for ${streamUrl}`),
          ),
        true,
      );
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
    child.stderr.on("data", (d: Buffer) =>
      stderr.push(d.toString("utf8")),
    );

    child.on("error", (err: Error) => {
      finish(() =>
        reject(new Error(`ffmpeg process error: ${err.message}`)),
      );
    });

    child.on("close", (code: number | null) => {
      finish(() => {
        const buf = Buffer.concat(chunks);
        if (code !== 0 && buf.length === 0) {
          const tail = stderr.join("").trim().slice(-500);
          reject(
            new Error(
              `ffmpeg exited ${code ?? "null"} for ${streamUrl}${
                tail ? `: ${tail}` : ""
              }`,
            ),
          );
          return;
        }
        if (buf.length === 0) {
          reject(new Error(`ffmpeg produced no frame for ${streamUrl}`));
          return;
        }
        resolve(buf);
      });
    });
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
