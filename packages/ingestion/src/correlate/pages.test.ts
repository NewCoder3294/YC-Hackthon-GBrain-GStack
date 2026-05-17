import { describe, it, expect } from "vitest";
import { buildIncidentPages } from "./pages";
import type { CandidateCluster, LiveSignal, ScoredIncident } from "./types";

const NOW = new Date("2026-05-16T12:00:00.000Z");

function sig(p: Partial<LiveSignal> & { id: string }): LiveSignal {
  return {
    id: p.id,
    source: p.source ?? "camera",
    sourceType: "camera_public",
    feed: null,
    occurredAt: p.occurredAt ?? "2026-05-16T11:30:00.000Z",
    lat: 37.76,
    lng: -122.41,
    category: "Weapons Offense",
    affinityGroup: "weapons-violence",
    confidence: p.confidence ?? 0.8,
    neighborhood: "Bayview Hunters Point",
    summary: p.summary ?? "armed person",
  };
}

const cluster: CandidateCluster = {
  id: "incident-deadbeef",
  signals: [
    sig({ id: "a", source: "camera", occurredAt: "2026-05-16T11:30:00.000Z" }),
    sig({ id: "b", source: "call_911", occurredAt: "2026-05-16T11:35:00.000Z" }),
  ],
  neighborhood: "Bayview Hunters Point",
  hasDatasfDup: false,
};

const incident: ScoredIncident = {
  cluster,
  factors: {
    corroboration: 0.66,
    severity: 1,
    anomaly: 0.5,
    equity: 0.7,
    degraded: false,
  },
  priority: 0.81,
  tier: "P1",
  rationale: "Two sources within 5 min on an armed-person call.",
};

describe("buildIncidentPages", () => {
  const [p] = buildIncidentPages([incident], NOW);

  it("uses cluster id as slug and type incident", () => {
    expect(p.slug).toBe("incident-deadbeef");
    expect(p.type).toBe("incident");
  });

  it("mirrors baseline frontmatter shape", () => {
    expect(p.frontmatter).toEqual({
      kind: "incident",
      meta: {},
      source: "correlator",
      samples: 2,
      legacy_id: "incident-deadbeef",
      confidence: 0.8,
      created_at: NOW.toISOString(),
      related_gang_id: null,
      related_incident_id: null,
    });
  });

  it("tags priority, neighborhood, affinity, sources and baseline link", () => {
    expect(p.tags).toEqual(
      expect.arrayContaining([
        "incident",
        "priority:P1",
        "neighborhood:bayview-hunters-point",
        "affinity:weapons-violence",
        "source:call_911",
        "source:camera",
        "link:baseline-datasf-sf-bayview-hunters-point",
      ]),
    );
  });

  it("builds a per-signal timeline and a factor-table body", () => {
    expect(p.timeline).toBe(
      "11:30 camera — armed person\n11:35 call_911 — armed person",
    );
    expect(p.compiledTruth).toContain("**Priority** | **0.81**");
    expect(p.compiledTruth).toContain(incident.rationale);
  });
});
