import { describe, it, expect } from "vitest";
import { aggregate, type IncidentRow } from "../baseline/metrics";
import { buildContexts, contextFor } from "./context";

const NOW = new Date("2026-05-16T00:00:00.000Z");
const daysAgo = (d: number): string =>
  new Date(NOW.getTime() - d * 86_400_000).toISOString();

function rows(): IncidentRow[] {
  const r: IncidentRow[] = [];
  // Mission: 4 incidents, all open → clearance 0 (worst).
  for (let i = 0; i < 4; i += 1)
    r.push({
      occurredAt: daysAgo(i + 1),
      neighborhood: "Mission",
      category: "Assault",
      resolution: "Open or Active",
    });
  // SOMA: 2 incidents, both cleared → clearance 1 (best).
  for (let i = 0; i < 2; i += 1)
    r.push({
      occurredAt: daysAgo(i + 1),
      neighborhood: "SOMA",
      category: "Robbery",
      resolution: "Cite or Arrest Adult",
    });
  return r;
}

describe("buildContexts", () => {
  const agg = aggregate(rows(), NOW);
  const ctx = buildContexts(agg);

  it("derives baseline30d, categoryRate and clearanceRate", () => {
    const m = ctx.get("Mission")!;
    expect(m.found).toBe(true);
    expect(m.baseline30d).toBe(4);
    expect(m.categoryRate["Assault"]).toBe(4);
    expect(m.clearanceRate).toBe(0);
  });

  it("gives worst-cleared neighborhood the top equity percentile", () => {
    expect(ctx.get("Mission")!.clearancePercentile).toBe(1);
    expect(ctx.get("SOMA")!.clearancePercentile).toBe(0);
  });
});

describe("contextFor", () => {
  it("returns a degraded default for an unknown neighborhood", () => {
    const c = contextFor(new Map(), "Nowhere");
    expect(c.found).toBe(false);
    expect(c.baseline30d).toBe(0);
    expect(c.clearancePercentile).toBe(0);
  });
});
