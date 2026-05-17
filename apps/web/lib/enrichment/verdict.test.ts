import { describe, it, expect } from "vitest";
import { computeConfidence } from "./verdict";

describe("computeConfidence", () => {
  it("scales corroborate with relevance, capped at 0.6", () => {
    expect(computeConfidence(0.4, "corroborate")).toBeCloseTo(0.4, 5);
    expect(computeConfidence(0.9, "corroborate")).toBeCloseTo(0.6, 5);
  });

  it("halves neutral and clamps", () => {
    expect(computeConfidence(0.8, "neutral")).toBeCloseTo(0.4, 5);
    expect(computeConfidence(2.0, "neutral")).toBeCloseTo(0.6, 5);
  });

  it("downweights contradict to a quarter", () => {
    expect(computeConfidence(1.0, "contradict")).toBeCloseTo(0.25, 5);
  });

  it("returns 0 for negative relevance", () => {
    expect(computeConfidence(-0.5, "corroborate")).toBe(0);
  });
});
