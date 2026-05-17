import { describe, it, expect } from "vitest";
import { buildQuery } from "./pipeline";

describe("buildQuery", () => {
  it("composes title + location + traffic incident", () => {
    const q = buildQuery({
      id: "x",
      title: "Multi-vehicle collision blocking #2 lane",
      severity: "high",
      createdAt: "2026-05-16T19:39:00Z",
      location: "I-880 N at 23rd Ave",
    });
    expect(q).toContain("Multi-vehicle collision");
    expect(q).toContain("I-880 N at 23rd Ave");
    expect(q).toContain("traffic incident");
  });

  it("omits location cleanly when missing", () => {
    const q = buildQuery({
      id: "x",
      title: "Stalled vehicle",
      severity: "low",
      createdAt: "2026-05-16T19:00:00Z",
      location: null,
    });
    expect(q).toBe("Stalled vehicle traffic incident");
  });
});
