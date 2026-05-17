import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { buildFfmpegArgs, grabFrame, type SpawnFn } from "./frame";

describe("buildFfmpegArgs", () => {
  it("builds a single-frame JPEG-to-stdout argv", () => {
    const url = "https://wzmedia.dot.ca.gov/D4/N280_at_6th.stream/playlist.m3u8";
    const args = buildFfmpegArgs(url);
    expect(args).toEqual([
      "-y",
      "-loglevel",
      "error",
      "-i",
      url,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ]);
  });

  it("passes the stream URL through verbatim (no shell quoting)", () => {
    const args = buildFfmpegArgs("rtsp://x?a=1&b=2");
    expect(args[args.indexOf("-i") + 1]).toBe("rtsp://x?a=1&b=2");
  });
});

/** Minimal fake ffmpeg child process driven by the test. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: (sig?: string) => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("grabFrame", () => {
  it("resolves the concatenated JPEG bytes on a clean exit", async () => {
    const child = fakeChild();
    const spawn: SpawnFn = vi.fn().mockReturnValue(child) as never;

    const promise = grabFrame("https://stream/playlist.m3u8", {
      spawn,
      ffmpegPath: "/fake/ffmpeg",
    });

    child.stdout.emit("data", Buffer.from([0xff, 0xd8]));
    child.stdout.emit("data", Buffer.from([0xff, 0xd9]));
    child.emit("close", 0);

    const buf = await promise;
    expect([...buf]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    expect(spawn).toHaveBeenCalledWith("/fake/ffmpeg", expect.any(Array));
  });

  it("rejects when ffmpeg exits non-zero with no output", async () => {
    const child = fakeChild();
    const spawn: SpawnFn = vi.fn().mockReturnValue(child) as never;

    const promise = grabFrame("https://bad/stream", {
      spawn,
      ffmpegPath: "/fake/ffmpeg",
    });
    child.stderr.emit("data", Buffer.from("404 Not Found"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow(/exited 1.*404 Not Found/s);
  });

  it("rejects and kills the child on timeout", async () => {
    const child = fakeChild();
    const spawn: SpawnFn = vi.fn().mockReturnValue(child) as never;

    const promise = grabFrame("https://hang/stream", {
      spawn,
      ffmpegPath: "/fake/ffmpeg",
      timeoutMs: 5,
    });

    await expect(promise).rejects.toThrow(/timed out after 5ms/);
    expect(child.kill).toHaveBeenCalled();
  });

  it("rejects when the process emits an error", async () => {
    const child = fakeChild();
    const spawn: SpawnFn = vi.fn().mockReturnValue(child) as never;

    const promise = grabFrame("https://x/stream", {
      spawn,
      ffmpegPath: "/missing/ffmpeg",
    });
    child.emit("error", new Error("ENOENT"));

    await expect(promise).rejects.toThrow(/process error: ENOENT/);
  });
});
