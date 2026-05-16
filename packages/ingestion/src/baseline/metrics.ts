/**
 * Pure aggregation of DataSF incidents → per-neighborhood baselines +
 * a cross-neighborhood disparity proxy. No IO — fully unit-testable
 * (mirrors calls/generator.ts).
 *
 * Disparity is a PROXY equity signal from reported-incident volume +
 * clearance only. It is NOT the TRD under-policing (reports/responses)
 * or indiscriminate (stops/incidents) ratio — those need dispatch /
 * stop data this system does not have.
 */

export interface IncidentRow {
  occurredAt: string; // ISO (signal_events.occurred_at)
  neighborhood: string; // payload.neighborhood ("" / null → Unknown)
  category: string; // payload.category
  resolution: string; // payload.resolution
}

export interface CategoryShare {
  category: string;
  count: number;
  sharePct: number;
}

export interface Clearance {
  enforcement: number;
  unfounded: number;
  open: number;
  rate: number; // enforcement / total
}

export interface NeighborhoodBaseline {
  neighborhood: string;
  total: number;
  windows: { d7: number; d30: number; d90: number; d365: number };
  trendPct: number; // current 30d vs prior 30d, signed %
  categoryMix: CategoryShare[];
  clearance: Clearance;
}

export interface Disparity {
  byVolume: { neighborhood: string; total: number }[];
  byClearance: { neighborhood: string; rate: number }[];
  volumeSpreadRatio: number; // max total / min total (>=1, 0 if <2 nbhds)
}

export interface AggregateResult {
  neighborhoods: NeighborhoodBaseline[]; // ranked by total desc
  disparity: Disparity;
  unknownCount: number;
  totalIncidents: number;
}

const ENFORCEMENT = new Set([
  "Cite or Arrest Adult",
  "Cite or Arrest Juvenile",
  "Exceptional Adult",
  "Exceptional Juvenile",
]);
const UNFOUNDED = new Set(["Unfounded"]);

function classify(res: string): "enforcement" | "unfounded" | "open" {
  if (ENFORCEMENT.has(res)) return "enforcement";
  if (UNFOUNDED.has(res)) return "unfounded";
  return "open";
}

function within(occurredMs: number, nowMs: number, days: number): boolean {
  return occurredMs >= nowMs - days * 86_400_000 && occurredMs <= nowMs;
}

export function aggregate(
  rows: readonly IncidentRow[],
  now: Date,
): AggregateResult {
  const nowMs = now.getTime();
  const byNbhd = new Map<string, IncidentRow[]>();
  let unknownCount = 0;

  for (const r of rows) {
    const nb = r.neighborhood.trim();
    if (nb.length === 0) {
      unknownCount += 1;
      continue;
    }
    const list = byNbhd.get(nb) ?? [];
    list.push(r);
    byNbhd.set(nb, list);
  }

  const neighborhoods: NeighborhoodBaseline[] = [];
  for (const [neighborhood, list] of byNbhd) {
    const times = list.map((r) => new Date(r.occurredAt).getTime());
    const win = (d: number) =>
      times.filter((t) => within(t, nowMs, d)).length;

    const current30 = win(30);
    const prior30 = times.filter(
      (t) =>
        t >= nowMs - 60 * 86_400_000 && t < nowMs - 30 * 86_400_000,
    ).length;
    const trendPct =
      prior30 === 0
        ? current30 > 0
          ? 100
          : 0
        : Math.round(((current30 - prior30) / prior30) * 100);

    const catCounts = new Map<string, number>();
    for (const r of list) {
      catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
    }
    const total = list.length;
    const categoryMix: CategoryShare[] = [...catCounts.entries()]
      .map(([category, count]) => ({
        category,
        count,
        sharePct: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
      .slice(0, 5);

    let enforcement = 0;
    let unfounded = 0;
    let open = 0;
    for (const r of list) {
      const c = classify(r.resolution);
      if (c === "enforcement") enforcement += 1;
      else if (c === "unfounded") unfounded += 1;
      else open += 1;
    }

    neighborhoods.push({
      neighborhood,
      total,
      windows: { d7: win(7), d30: win(30), d90: win(90), d365: win(365) },
      trendPct,
      categoryMix,
      clearance: {
        enforcement,
        unfounded,
        open,
        rate: total === 0 ? 0 : enforcement / total,
      },
    });
  }

  neighborhoods.sort(
    (a, b) => b.total - a.total || a.neighborhood.localeCompare(b.neighborhood),
  );

  const byVolume = neighborhoods.map((n) => ({
    neighborhood: n.neighborhood,
    total: n.total,
  }));
  const byClearance = [...neighborhoods]
    .sort(
      (a, b) =>
        a.clearance.rate - b.clearance.rate ||
        a.neighborhood.localeCompare(b.neighborhood),
    )
    .map((n) => ({ neighborhood: n.neighborhood, rate: n.clearance.rate }));
  const totals = byVolume.map((v) => v.total);
  const volumeSpreadRatio =
    totals.length < 2 || Math.min(...totals) === 0
      ? 0
      : Math.max(...totals) / Math.min(...totals);

  return {
    neighborhoods,
    disparity: { byVolume, byClearance, volumeSpreadRatio },
    unknownCount,
    totalIncidents: rows.length,
  };
}
