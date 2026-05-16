import { describe, it, expect } from "vitest";
import { scheduleScenarios, toSignalEvent } from "./generator";
import type { Scenario } from "./scenarios";
import type { TranscriptSummary } from "./summarize";

const mk = (id: string, offsetSeconds: number): Scenario => ({
  id,
  transcript: `transcript for ${id}`,
  lat: 37.7649,
  lng: -122.4194,
  offsetSeconds,
  callerHungUp: id === "c",
  keywords: ["k"],
});

describe("scheduleScenarios", () => {
  const start = new Date("2026-05-16T20:00:00.000Z");

  it("orders by offset and computes absolute fire times (speed=1)", () => {
    const out = scheduleScenarios([mk("c", 60), mk("a", 0), mk("b", 25)], start);
    expect(out.map((o) => o.scenario.id)).toEqual(["a", "b", "c"]);
    expect(out[0]!.fireAt.getTime()).toBe(start.getTime());
    expect(out[1]!.fireAt.getTime()).toBe(start.getTime() + 25_000);
    expect(out[2]!.fireAt.getTime()).toBe(start.getTime() + 60_000);
  });

  it("compresses the timeline by speed (3-min demo math)", () => {
    const out = scheduleScenarios([mk("a", 0), mk("b", 170)], start, 10);
    // 170s / 10 = 17s span.
    expect(out[1]!.fireAt.getTime()).toBe(start.getTime() + 17_000);
  });

  it("does not mutate the input array", () => {
    const input = [mk("b", 25), mk("a", 0)];
    const snapshot = input.map((s) => s.id);
    scheduleScenarios(input, start);
    expect(input.map((s) => s.id)).toEqual(snapshot);
  });

  it("throws on non-positive or non-finite speed", () => {
    expect(() => scheduleScenarios([mk("a", 0)], start, 0)).toThrow();
    expect(() => scheduleScenarios([mk("a", 0)], start, -1)).toThrow();
    expect(() =>
      scheduleScenarios([mk("a", 0)], start, Number.POSITIVE_INFINITY),
    ).toThrow();
  });

  it("handles an empty scenario list", () => {
    expect(scheduleScenarios([], start)).toEqual([]);
  });
});

describe("toSignalEvent", () => {
  const summary: TranscriptSummary = {
    summary: "Fight at Mission & 16th, caller hung up.",
    keywords: ["assault", "fight"],
    fromModel: true,
  };
  const occurredAt = new Date("2026-05-16T20:01:02.000Z");

  it("maps a scenario onto the call_911 contract shape", () => {
    const ev = toSignalEvent(mk("c", 0), summary, occurredAt);
    expect(ev).toMatchObject({
      sourceType: "call_911",
      sourceId: "c",
      lat: 37.7649,
      lng: -122.4194,
      confidence: null,
      rawClipUri: null,
      occurredAt,
    });
    expect(ev.payload).toEqual({
      transcript: "transcript for c",
      summary: "Fight at Mission & 16th, caller hung up.",
      keywords: ["assault", "fight"],
      callerHungUp: true,
      summaryFromModel: true,
    });
  });
});
