import { describe, it, expect } from "vitest";
import { buildCameraSignalEvent, configFromEnv } from "./run";
import type { PinnedCamera } from "./pins";
import type { Detection } from "./detect";
import { signalEventInputSchema } from "../signal-events";

const camera: PinnedCamera = {
  caltransId: "TVD04--SF1",
  description: "US-101 N @ 6TH ST",
  lat: 37.7749,
  lng: -122.4194,
  streamUrl: "https://wzmedia.dot.ca.gov/D4/N101_at_6th.stream/playlist.m3u8",
};

const detections: Detection[] = [
  { label: "car", score: 0.72, box: { xmin: 0, ymin: 0, xmax: 0.2, ymax: 0.3 } },
  { label: "person", score: 0.88, box: { xmin: 0.4, ymin: 0.5, xmax: 0.5, ymax: 0.8 } },
];

describe("buildCameraSignalEvent", () => {
  it("maps detections to a contract-valid SignalEventInput", () => {
    const frameAt = new Date("2026-05-16T20:30:00.000Z");
    const event = buildCameraSignalEvent(camera, detections, frameAt);

    expect(event).not.toBeNull();
    // Must satisfy the shared producer contract schema.
    const parsed = signalEventInputSchema.parse(event);

    expect(parsed.sourceType).toBe("camera_public");
    expect(parsed.sourceId).toBe("TVD04--SF1");
    expect(parsed.occurredAt).toEqual(frameAt);
    expect(parsed.lat).toBeCloseTo(37.7749);
    expect(parsed.lng).toBeCloseTo(-122.4194);
    // confidence is the MAX detection score.
    expect(parsed.confidence).toBeCloseTo(0.88);
    expect(parsed.rawClipUri).toBe(camera.streamUrl);

    expect(parsed.payload).toMatchObject({
      camera: "US-101 N @ 6TH ST",
      streamUrl: camera.streamUrl,
      frameAt: "2026-05-16T20:30:00.000Z",
    });
    expect(parsed.payload.detections).toEqual(detections);
  });

  it("returns null when there are no detections (empty frame, no event)", () => {
    expect(buildCameraSignalEvent(camera, [], new Date())).toBeNull();
  });
});

describe("configFromEnv", () => {
  it("defaults pollMs to 2000 and pinIds to undefined", () => {
    expect(configFromEnv({})).toEqual({ pinIds: undefined, pollMs: 2000 });
  });

  it("parses CAMERA_PIN_IDS as a trimmed comma list", () => {
    const c = configFromEnv({ CAMERA_PIN_IDS: " A , B ,, C " });
    expect(c.pinIds).toEqual(["A", "B", "C"]);
  });

  it("honors a valid CAMERA_POLL_MS and ignores garbage", () => {
    expect(configFromEnv({ CAMERA_POLL_MS: "500" }).pollMs).toBe(500);
    expect(configFromEnv({ CAMERA_POLL_MS: "nope" }).pollMs).toBe(2000);
    expect(configFromEnv({ CAMERA_POLL_MS: "-3" }).pollMs).toBe(2000);
  });
});
