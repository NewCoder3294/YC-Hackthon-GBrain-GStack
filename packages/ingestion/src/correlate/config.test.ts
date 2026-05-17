import { describe, it, expect } from "vitest";
import {
  WEIGHTS,
  TIER_THRESHOLDS,
  CATEGORY_AFFINITY,
  PRIORITY_SEVERITY,
} from "./config";

describe("config invariants", () => {
  it("composite weights sum to ~1", () => {
    const sum =
      WEIGHTS.corroboration +
      WEIGHTS.severity +
      WEIGHTS.anomaly +
      WEIGHTS.equity;
    expect(sum).toBeCloseTo(1, 5);
  });

  it("tier thresholds are strictly descending in (0,1)", () => {
    expect(TIER_THRESHOLDS.P1).toBeGreaterThan(TIER_THRESHOLDS.P2);
    expect(TIER_THRESHOLDS.P2).toBeGreaterThan(TIER_THRESHOLDS.P3);
    expect(TIER_THRESHOLDS.P3).toBeGreaterThan(0);
    expect(TIER_THRESHOLDS.P1).toBeLessThan(1);
  });

  it("every affinity severity is in [0,1] and group is non-empty", () => {
    for (const [pattern, group, sev] of CATEGORY_AFFINITY) {
      expect(pattern).toBeInstanceOf(RegExp);
      expect(group.length).toBeGreaterThan(0);
      expect(sev).toBeGreaterThanOrEqual(0);
      expect(sev).toBeLessThanOrEqual(1);
    }
  });

  it("priority severities are in [0,1]", () => {
    for (const v of Object.values(PRIORITY_SEVERITY)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
