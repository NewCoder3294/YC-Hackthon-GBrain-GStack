import { describe, it, expect } from "vitest";
import {
  mapPageToRankedIncident,
  rankIncidentPages,
  type IncidentPageRow,
} from "./ranked";

function pageRow(p: Partial<IncidentPageRow>): IncidentPageRow {
  return {
    id: p.id ?? "10",
    slug: p.slug ?? "incident-deadbeef",
    type: "incident",
    title:
      p.title ??
      "P1 · weapons-violence · Mission · 3 signal(s) · p0.82",
    compiled_truth:
      p.compiled_truth ??
      "**P1** correlated incident...\n| **Priority** | **0.82** |\n> Three sources within 90s on an armed call.",
    frontmatter:
      p.frontmatter ??
      { samples: 3, confidence: 0.7, lat: 37.7601, lng: -122.4101 },
    updated_at: p.updated_at ?? "2026-05-16T12:00:00.000Z",
    tags: p.tags ?? [
      { tag: "incident" },
      { tag: "priority:P1" },
      { tag: "neighborhood:mission" },
      { tag: "affinity:weapons-violence" },
      { tag: "source:camera" },
      { tag: "source:call_911" },
    ],
  };
}

describe("mapPageToRankedIncident", () => {
  it("extracts tier, priority, neighborhood, sources and rationale", () => {
    const r = mapPageToRankedIncident(pageRow({}));
    expect(r.tier).toBe("P1");
    expect(r.priority).toBeCloseTo(0.82, 5);
    expect(r.neighborhood).toBe("mission");
    expect(r.affinity).toBe("weapons-violence");
    expect(r.sources).toEqual(["call_911", "camera"]);
    expect(r.sourceCount).toBe(2);
    expect(r.lat).toBeCloseTo(37.7601, 4);
    expect(r.lng).toBeCloseTo(-122.4101, 4);
    expect(r.samples).toBe(3);
    expect(r.confidence).toBe(0.7);
    expect(r.rationale).toBe("Three sources within 90s on an armed call.");
  });

  it("defaults safely on a sparse row", () => {
    const r = mapPageToRankedIncident({
      id: 1,
      slug: "incident-x",
      type: "incident",
      title: "incident",
      compiled_truth: "",
      frontmatter: null,
      updated_at: "2026-05-16T00:00:00.000Z",
      tags: null,
    });
    expect(r.tier).toBe("P4");
    expect(r.priority).toBe(0);
    expect(r.neighborhood).toBe("unknown");
    expect(r.sources).toEqual([]);
  });
});

describe("rankIncidentPages", () => {
  it("sorts by priority desc", () => {
    const out = rankIncidentPages([
      pageRow({ slug: "lo", title: "P3 · x · y · 1 · p0.30" }),
      pageRow({ slug: "hi", title: "P1 · x · y · 3 · p0.91" }),
    ]);
    expect(out.map((r) => r.slug)).toEqual(["hi", "lo"]);
  });

  it("drops non-correlator (seed) incident pages", () => {
    const seed = pageRow({
      slug: "legacy-seed-42",
      title: "some seeded incident",
      frontmatter: { source: "seed" },
      tags: [{ tag: "legacy" }],
    });
    const real = pageRow({ slug: "incident-deadbeef" });
    const out = rankIncidentPages([seed, real]);
    expect(out.map((r) => r.slug)).toEqual(["incident-deadbeef"]);
  });
});
