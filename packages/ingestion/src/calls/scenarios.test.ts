import { describe, it, expect } from "vitest";
import {
  SCENARIOS,
  scenarioSchema,
  findScenario,
} from "./scenarios";

describe("911 scenarios", () => {
  it("every scenario passes the zod schema", () => {
    for (const s of SCENARIOS) {
      expect(() => scenarioSchema.parse(s)).not.toThrow();
    }
  });

  it("provides 6-8 scenarios with unique ids", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(6);
    expect(SCENARIOS.length).toBeLessThanOrEqual(8);
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the canonical demo beats (Mission fight + HP shots + ambiguous)", () => {
    const missionFight = findScenario("sf-911-mission-16th-fight");
    expect(missionFight).toBeDefined();
    expect(missionFight!.callerHungUp).toBe(true);
    expect(missionFight!.lat).toBeCloseTo(37.7649, 3);
    expect(missionFight!.lng).toBeCloseTo(-122.4194, 3);

    const shots = findScenario("sf-911-hunterspoint-shots-fired");
    expect(shots).toBeDefined();
    expect(shots!.lat).toBeCloseTo(37.7299, 3);
    expect(shots!.lng).toBeCloseTo(-122.3829, 3);
    expect(shots!.keywords).toContain("shots fired");
    expect(shots!.keywords).toContain("vehicle fled");

    const ambiguous = SCENARIOS.filter((s) =>
      s.keywords.includes("ambiguous"),
    );
    expect(ambiguous.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a malformed scenario (bad coordinate)", () => {
    expect(() =>
      scenarioSchema.parse({
        id: "x",
        transcript: "t",
        lat: 999,
        lng: 0,
        offsetSeconds: 0,
        callerHungUp: false,
        keywords: ["k"],
      }),
    ).toThrow();
  });

  it("rejects a negative offset", () => {
    expect(() =>
      scenarioSchema.parse({
        id: "x",
        transcript: "t",
        lat: 37,
        lng: -122,
        offsetSeconds: -5,
        callerHungUp: false,
        keywords: ["k"],
      }),
    ).toThrow();
  });

  it("findScenario returns undefined for an unknown id", () => {
    expect(findScenario("nope")).toBeUndefined();
  });
});
