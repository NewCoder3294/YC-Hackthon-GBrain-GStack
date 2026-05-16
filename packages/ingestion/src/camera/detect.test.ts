import { describe, it, expect, vi } from "vitest";

// Stub the heavy ML dep so importing detect.ts never loads a model or
// reaches the network. RawImage.fromBlob just echoes a marker.
vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(),
  RawImage: {
    fromBlob: vi.fn().mockResolvedValue({ __rawImage: true }),
  },
}));

import {
  detectObjects,
  RELEVANT_LABELS,
  DETECTION_MODEL_ID,
  DEFAULT_DETECTION_THRESHOLD,
  type DetectorFn,
} from "./detect";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe("detect constants", () => {
  it("pins the small YOLOS model id", () => {
    expect(DETECTION_MODEL_ID).toBe("Xenova/yolos-tiny");
    expect(DEFAULT_DETECTION_THRESHOLD).toBe(0.5);
  });

  it("targets COCO people + road vehicles only", () => {
    expect(RELEVANT_LABELS).toEqual([
      "person",
      "bicycle",
      "car",
      "motorcycle",
      "bus",
      "truck",
    ]);
  });
});

describe("detectObjects", () => {
  it("filters to relevant labels, drops sub-threshold, sorts by score", async () => {
    const detector: DetectorFn = vi.fn().mockResolvedValue([
      { label: "car", score: 0.91, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
      { label: "traffic light", score: 0.99, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
      { label: "person", score: 0.42, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
      { label: "person", score: 0.77, box: { xmin: 0.1, ymin: 0.1, xmax: 0.2, ymax: 0.3 } },
    ]);

    const out = await detectObjects(jpeg, 0.5, { detector });

    expect(out.map((d) => `${d.label}:${d.score}`)).toEqual([
      "car:0.91",
      "person:0.77",
    ]);
    expect(detector).toHaveBeenCalledWith(
      { __rawImage: true },
      { threshold: 0.5, percentage: true },
    );
  });

  it("rejects malformed detector entries safely", async () => {
    const detector: DetectorFn = vi.fn().mockResolvedValue([
      { label: "car" }, // no score/box
      { label: "truck", score: "high", box: {} }, // bad types
      null,
      { label: "bus", score: 0.8, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
    ]);
    const out = await detectObjects(jpeg, 0.5, { detector });
    expect(out).toEqual([
      { label: "bus", score: 0.8, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
    ]);
  });

  it("throws on an empty frame buffer", async () => {
    await expect(detectObjects(Buffer.alloc(0))).rejects.toThrow(
      /empty frame/,
    );
  });
});
