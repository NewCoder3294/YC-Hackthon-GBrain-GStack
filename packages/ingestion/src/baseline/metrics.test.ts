import { describe, it, expect } from "vitest";
import { aggregate, type IncidentRow } from "./metrics";

const NOW = new Date("2026-05-16T00:00:00.000Z");
const daysAgo = (d: number) =>
  new Date(NOW.getTime() - d * 86_400_000).toISOString();

function row(p: Partial<IncidentRow> & { neighborhood: string }): IncidentRow {
  return {
    occurredAt: p.occurredAt ?? daysAgo(1),
    neighborhood: p.neighborhood,
    category: p.category ?? "Larceny Theft",
    resolution: p.resolution ?? "Open or Active",
  };
}

describe("aggregate", () => {
  it("counts per neighborhood across time windows", () => {
    const rows: IncidentRow[] = [
      row({ neighborhood: "Mission", occurredAt: daysAgo(2) }),
      row({ neighborhood: "Mission", occurredAt: daysAgo(20) }),
      row({ neighborhood: "Mission", occurredAt: daysAgo(200) }),
      row({ neighborhood: "SOMA", occurredAt: daysAgo(3) }),
    ];
    const { neighborhoods } = aggregate(rows, NOW);
    const m = neighborhoods.find((n) => n.neighborhood === "Mission")!;
    expect(m.total).toBe(3);
    expect(m.windows.d7).toBe(1);
    expect(m.windows.d30).toBe(2);
    expect(m.windows.d90).toBe(2);
    expect(m.windows.d365).toBe(3);
  });

  it("computes 30d-vs-prior-30d trend percent", () => {
    const rows: IncidentRow[] = [
      row({ neighborhood: "Mission", occurredAt: daysAgo(5) }),
      row({ neighborhood: "Mission", occurredAt: daysAgo(10) }),
      row({ neighborhood: "Mission", occurredAt: daysAgo(40) }),
    ];
    const { neighborhoods } = aggregate(rows, NOW);
    const m = neighborhoods.find((n) => n.neighborhood === "Mission")!;
    // current30 = 2, prior30 = 1 → +100%
    expect(m.trendPct).toBe(100);
  });

  it("buckets resolution into clearance rate", () => {
    const rows: IncidentRow[] = [
      row({ neighborhood: "Mission", resolution: "Cite or Arrest Adult" }),
      row({ neighborhood: "Mission", resolution: "Exceptional Adult" }),
      row({ neighborhood: "Mission", resolution: "Open or Active" }),
      row({ neighborhood: "Mission", resolution: "Unfounded" }),
    ];
    const { neighborhoods } = aggregate(rows, NOW);
    const m = neighborhoods.find((n) => n.neighborhood === "Mission")!;
    expect(m.clearance.enforcement).toBe(2);
    expect(m.clearance.unfounded).toBe(1);
    expect(m.clearance.open).toBe(1);
    expect(m.clearance.rate).toBeCloseTo(0.5);
  });

  it("ranks top-5 category mix by count", () => {
    const rows: IncidentRow[] = [
      ...Array(3).fill(0).map(() => row({ neighborhood: "M", category: "Assault" })),
      ...Array(2).fill(0).map(() => row({ neighborhood: "M", category: "Burglary" })),
      row({ neighborhood: "M", category: "Arson" }),
    ];
    const { neighborhoods } = aggregate(rows, NOW);
    const m = neighborhoods.find((n) => n.neighborhood === "M")!;
    expect(m.categoryMix[0]).toMatchObject({ category: "Assault", count: 3 });
    expect(m.categoryMix.length).toBeLessThanOrEqual(5);
    expect(m.categoryMix[0]!.sharePct).toBeCloseTo(50);
  });

  it("buckets blank/null neighborhood as Unknown and excludes from ranked", () => {
    const rows: IncidentRow[] = [
      row({ neighborhood: "" }),
      row({ neighborhood: "Mission" }),
    ];
    const { neighborhoods, unknownCount } = aggregate(rows, NOW);
    expect(unknownCount).toBe(1);
    expect(neighborhoods.map((n) => n.neighborhood)).toEqual(["Mission"]);
  });

  it("computes disparity ranking + spread across all neighborhoods", () => {
    const rows: IncidentRow[] = [
      ...Array(10).fill(0).map(() => row({ neighborhood: "HighVol", resolution: "Open or Active" })),
      ...Array(2).fill(0).map(() => row({ neighborhood: "LowVol", resolution: "Cite or Arrest Adult" })),
    ];
    const { disparity } = aggregate(rows, NOW);
    expect(disparity.byVolume[0]!.neighborhood).toBe("HighVol");
    // byClearance is ascending = lowest clearance first (equity lens;
    // pages.ts reads [0] as "Lowest clearance"). HighVol = 0% cleared.
    expect(disparity.byClearance[0]!.neighborhood).toBe("HighVol");
    expect(disparity.byClearance[0]!.rate).toBe(0);
    expect(disparity.volumeSpreadRatio).toBe(5); // 10 / 2
  });
});
