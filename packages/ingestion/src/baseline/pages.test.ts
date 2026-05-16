import { describe, it, expect } from "vitest";
import { buildPages, slugifyNeighborhood, type GbrainPage } from "./pages";
import { aggregate, type IncidentRow } from "./metrics";

const NOW = new Date("2026-05-16T00:00:00.000Z");

function rows(): IncidentRow[] {
  const r: IncidentRow[] = [];
  for (let i = 0; i < 12; i += 1)
    r.push({
      occurredAt: new Date(NOW.getTime() - i * 86_400_000).toISOString(),
      neighborhood: "Mission",
      category: "Assault",
      resolution: i % 3 === 0 ? "Cite or Arrest Adult" : "Open or Active",
    });
  r.push({
    occurredAt: NOW.toISOString(),
    neighborhood: "Bayview Hunters Point",
    category: "Robbery",
    resolution: "Open or Active",
  });
  return r;
}

describe("slugifyNeighborhood", () => {
  it("lowercases and dash-separates", () => {
    expect(slugifyNeighborhood("Bayview Hunters Point")).toBe(
      "bayview-hunters-point",
    );
    expect(slugifyNeighborhood("  Mission  ")).toBe("mission");
  });
});

describe("buildPages", () => {
  const agg = aggregate(rows(), NOW);
  const pages: GbrainPage[] = buildPages(agg, NOW, 10);

  it("emits top-N baseline pages + rollup + disparity", () => {
    const slugs = pages.map((p) => p.slug);
    expect(slugs).toContain("baseline-datasf-sf-mission");
    expect(slugs).toContain("baseline-datasf-sf-rollup");
    expect(slugs).toContain("pattern-datasf-sf-neighborhood-disparity");
  });

  it("baseline page has the exact seeded frontmatter shape", () => {
    const p = pages.find((x) => x.slug === "baseline-datasf-sf-mission")!;
    expect(p.type).toBe("baseline");
    expect(p.frontmatter).toMatchObject({
      kind: "baseline",
      meta: {},
      source: "datasf",
      confidence: 1.0,
      related_gang_id: null,
      related_incident_id: null,
      legacy_id: "datasf-baseline-sf-mission",
    });
    expect(p.frontmatter.samples).toBe(12);
    expect(typeof p.frontmatter.created_at).toBe("string");
    expect(p.tags).toContain("baseline:mission");
    expect(p.tags).toContain("feed:datasf_sfpd_incidents");
    expect(p.tags).toContain("source:datasf");
  });

  it("disparity page is type=pattern with the proxy caption", () => {
    const p = pages.find(
      (x) => x.slug === "pattern-datasf-sf-neighborhood-disparity",
    )!;
    expect(p.type).toBe("pattern");
    expect(p.frontmatter.kind).toBe("pattern");
    expect(p.compiledTruth).toContain("Proxy equity signal");
    expect(p.compiledTruth).toContain("NOT");
    expect(p.tags).toContain("trend:neighborhood-disparity");
  });

  it("is deterministic (same input → identical output)", () => {
    const a = buildPages(agg, NOW, 10);
    const b = buildPages(agg, NOW, 10);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("writes one page per neighborhood when fewer than N have data", () => {
    const small = aggregate(
      [
        {
          occurredAt: NOW.toISOString(),
          neighborhood: "Mission",
          category: "Assault",
          resolution: "Open or Active",
        },
      ],
      NOW,
    );
    const ps = buildPages(small, NOW, 10);
    const baselineNbhd = ps.filter(
      (p) => p.type === "baseline" && p.slug !== "baseline-datasf-sf-rollup",
    );
    expect(baselineNbhd).toHaveLength(1);
  });
});
