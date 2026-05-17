import { describe, it, expect } from "vitest";
import { SCENARIOS, pickScenario } from "./scenarios";

describe("SCENARIOS", () => {
  it("each scenario has at least one signal and a unique key", () => {
    const keys = new Set<string>();
    for (const s of SCENARIOS) {
      expect(s.signals.length).toBeGreaterThan(0);
      expect(s.key).toMatch(/^[a-z0-9-]+$/);
      expect(keys.has(s.key)).toBe(false);
      keys.add(s.key);
    }
  });

  it("at least one scenario per severity tier", () => {
    const tiers = new Set(SCENARIOS.map((s) => s.severity));
    expect(tiers.has("low")).toBe(true);
    expect(tiers.has("med")).toBe(true);
    expect(tiers.has("high")).toBe(true);
  });

  it("coordinates are inside SF bounding box", () => {
    for (const s of SCENARIOS) {
      expect(s.lat).toBeGreaterThan(37.6);
      expect(s.lat).toBeLessThan(37.85);
      expect(s.lng).toBeGreaterThan(-122.55);
      expect(s.lng).toBeLessThan(-122.35);
    }
  });
});

describe("pickScenario", () => {
  it("returns the same scenario inside the same minute", () => {
    const t = new Date("2026-05-16T22:00:01Z");
    const a = pickScenario(t);
    const b = pickScenario(new Date("2026-05-16T22:00:59Z"));
    expect(a.key).toBe(b.key);
  });

  it("cycles through all scenarios across consecutive minutes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < SCENARIOS.length * 2; i++) {
      const t = new Date(`2026-05-16T22:${String(i).padStart(2, "0")}:00Z`);
      seen.add(pickScenario(t).key);
    }
    expect(seen.size).toBe(SCENARIOS.length);
  });
});
