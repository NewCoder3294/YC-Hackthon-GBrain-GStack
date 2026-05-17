/**
 * Per-neighborhood context for scoring, derived from the SAME DataSF
 * aggregate the GBrain baseline pages are a projection of (baseline/
 * metrics.ts). We reuse aggregate() rather than re-parsing GBrain
 * markdown so the numbers are identical and fully unit-testable.
 */

import type { AggregateResult } from "../baseline/metrics";
import type { NeighborhoodContext } from "./types";

export function buildContexts(
  agg: AggregateResult,
): Map<string, NeighborhoodContext> {
  const out = new Map<string, NeighborhoodContext>();

  // byClearance is ascending by rate: index 0 = worst-cleared = highest
  // equity. Map rank → percentile in [0,1]; <2 neighborhoods → no signal.
  const order = agg.disparity.byClearance;
  const rankPercentile = new Map<string, number>();
  if (order.length >= 2) {
    order.forEach((o, idx) => {
      rankPercentile.set(o.neighborhood, 1 - idx / (order.length - 1));
    });
  }

  for (const n of agg.neighborhoods) {
    const categoryRate: Record<string, number> = {};
    for (const c of n.categoryMix) categoryRate[c.category] = c.count;
    out.set(n.neighborhood, {
      neighborhood: n.neighborhood,
      baseline30d: n.windows.d30,
      categoryRate,
      clearanceRate: n.clearance.rate,
      clearancePercentile: rankPercentile.get(n.neighborhood) ?? 0,
      found: true,
    });
  }
  return out;
}

/** Context for a neighborhood, or a degraded default that flags found=false. */
export function contextFor(
  contexts: ReadonlyMap<string, NeighborhoodContext>,
  neighborhood: string,
): NeighborhoodContext {
  return (
    contexts.get(neighborhood) ?? {
      neighborhood,
      baseline30d: 0,
      categoryRate: {},
      clearanceRate: 0,
      clearancePercentile: 0,
      found: false,
    }
  );
}
