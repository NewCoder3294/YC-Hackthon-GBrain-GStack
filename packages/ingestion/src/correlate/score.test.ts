import { describe, it, expect } from "vitest";
import {
  corroborationFactor,
  severityFactor,
  anomaly,
  equityFactor,
  scoreIncident,
  rankIncidents,
} from "./score";
import type {
  CandidateCluster,
  LiveSignal,
  NeighborhoodContext,
  ScoredIncident,
} from "./types";

const NOW = new Date("2026-05-16T12:00:00.000Z");

function s(p: Partial<LiveSignal> & { id: string }): LiveSignal {
  return {
    id: p.id,
    source: p.source ?? "call_911",
    sourceType: p.sourceType ?? "call_911",
    feed: p.feed ?? null,
    occurredAt: p.occurredAt ?? NOW.toISOString(),
    lat: 37.76,
    lng: -122.41,
    category: p.category ?? "Assault",
    affinityGroup: p.affinityGroup ?? "assault",
    confidence: p.confidence ?? 0.5,
    neighborhood: "Mission",
    summary: "x",
  };
}
function cl(signals: LiveSignal[], hasDatasfDup = false): CandidateCluster {
  return { id: "incident-1", signals, neighborhood: "Mission", hasDatasfDup };
}
const ctx = (p: Partial<NeighborhoodContext> = {}): NeighborhoodContext => ({
  neighborhood: "Mission",
  baseline30d: p.baseline30d ?? 30,
  categoryRate: p.categoryRate ?? {},
  clearanceRate: p.clearanceRate ?? 0.5,
  clearancePercentile: p.clearancePercentile ?? 0.5,
  found: p.found ?? true,
});

describe("corroborationFactor", () => {
  it("counts distinct sources, 3 distinct → 1.0", () => {
    expect(
      corroborationFactor(
        cl([
          s({ id: "a", source: "camera" }),
          s({ id: "b", source: "call_911" }),
          s({ id: "c", source: "citizen" }),
        ]),
      ),
    ).toBe(1);
  });
  it("datasf/call_911 dup counts 1.5 not 2", () => {
    const f = corroborationFactor(
      cl(
        [
          s({ id: "a", source: "call_911" }),
          s({ id: "b", source: "datasf" }),
        ],
        true,
      ),
    );
    expect(f).toBeCloseTo(0.5, 5); // (2 - 0.5)/3
  });
});

describe("severityFactor", () => {
  it("takes the max member severity by affinity group", () => {
    expect(
      severityFactor(
        cl([
          s({ id: "a", affinityGroup: "property" }),
          s({ id: "b", affinityGroup: "weapons-violence" }),
        ]),
      ),
    ).toBe(1);
  });
});

describe("anomaly", () => {
  it("is 0 and degraded when context not found", () => {
    expect(anomaly(cl([s({ id: "a" })]), ctx({ found: false }))).toEqual({
      ratio: 0,
      factor: 0,
    });
  });
  it("rises with burst size above expected", () => {
    // baseline30d=30 → expected in 48h = 30*48/720 = 2. cluster of 6 → ratio 3.
    const a = anomaly(
      cl([1, 2, 3, 4, 5, 6].map((i) => s({ id: `s${i}` }))),
      ctx({ baseline30d: 30 }),
    );
    expect(a.ratio).toBeCloseTo(3, 5);
    expect(a.factor).toBeCloseTo(0.5, 5); // (3-1)/4
  });
});

describe("equityFactor", () => {
  it("is dominated by clearance percentile", () => {
    const hi = equityFactor(
      cl([s({ id: "a", confidence: 1 })]),
      ctx({ clearancePercentile: 1 }),
      NOW,
    );
    const lo = equityFactor(
      cl([s({ id: "a", confidence: 1 })]),
      ctx({ clearancePercentile: 0 }),
      NOW,
    );
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("scoreIncident + rankIncidents", () => {
  it("flags degraded and assigns a tier", () => {
    const sc = scoreIncident(
      cl([
        s({ id: "a", source: "camera", affinityGroup: "weapons-violence" }),
        s({ id: "b", source: "call_911", affinityGroup: "weapons-violence" }),
        s({ id: "c", source: "citizen", affinityGroup: "weapons-violence" }),
      ]),
      ctx({ clearancePercentile: 1, baseline30d: 1 }),
      NOW,
    );
    expect(sc.factors.degraded).toBe(false);
    expect(["P1", "P2", "P3", "P4"]).toContain(sc.tier);
    expect(sc.priority).toBeGreaterThan(0);
  });
  it("ranks higher priority first", () => {
    const a: ScoredIncident = {
      cluster: cl([s({ id: "a" })]),
      factors: {
        corroboration: 0,
        severity: 0,
        anomaly: 0,
        equity: 0,
        degraded: false,
      },
      priority: 0.2,
      tier: "P4",
      rationale: "",
    };
    const b: ScoredIncident = { ...a, priority: 0.9, tier: "P1" };
    expect(rankIncidents([a, b])[0].priority).toBe(0.9);
  });
});
