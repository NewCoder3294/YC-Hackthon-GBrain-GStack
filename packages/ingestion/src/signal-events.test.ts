import { describe, it, expect } from "vitest";
import { buildSignalEventRows, signalEventInputSchema } from "./signal-events";

describe("signal-events contract", () => {
  const base = {
    sourceType: "camera_public" as const,
    sourceId: "TV317",
    occurredAt: new Date("2026-05-16T09:14:03Z"),
    lat: 37.7749,
    lng: -122.4194,
    payload: { objects: [{ label: "car", score: 0.77 }] },
  };

  it("maps a valid input to a row with defaulted nullables", () => {
    const [row] = buildSignalEventRows([base]);
    expect(row).toMatchObject({
      sourceType: "camera_public",
      sourceId: "TV317",
      lat: 37.7749,
      lng: -122.4194,
      confidence: null,
      rawClipUri: null,
    });
    expect(row?.payload).toEqual({ objects: [{ label: "car", score: 0.77 }] });
  });

  it("carries confidence and rawClipUri through when provided", () => {
    const [row] = buildSignalEventRows([
      { ...base, confidence: 0.92, rawClipUri: "https://cwwp2/x.jpg" },
    ]);
    expect(row).toMatchObject({
      confidence: 0.92,
      rawClipUri: "https://cwwp2/x.jpg",
    });
  });

  it("rejects an unknown source_type (enum guard)", () => {
    expect(() =>
      signalEventInputSchema.parse({ ...base, sourceType: "tiktok" }),
    ).toThrow();
  });

  it("rejects out-of-range coordinates", () => {
    expect(() =>
      signalEventInputSchema.parse({ ...base, lat: 999 }),
    ).toThrow();
  });

  it("rejects confidence outside 0..1", () => {
    expect(() =>
      signalEventInputSchema.parse({ ...base, confidence: 1.5 }),
    ).toThrow();
  });

  it("handles an empty batch", () => {
    expect(buildSignalEventRows([])).toEqual([]);
  });
});
