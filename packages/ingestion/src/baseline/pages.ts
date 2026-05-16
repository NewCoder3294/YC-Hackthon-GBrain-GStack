/**
 * Pure builder: aggregates → GBrain page objects matching the exact
 * shape of the seeded `type='baseline'` rows (verified live:
 * page_kind='markdown', timeline='', frontmatter {kind,meta,source,
 * samples,legacy_id,confidence,created_at,related_gang_id,
 * related_incident_id}). No IO — unit-testable.
 */

import type { AggregateResult, NeighborhoodBaseline } from "./metrics";

export interface GbrainFrontmatter {
  kind: "baseline" | "pattern";
  meta: Record<string, never>;
  source: "datasf";
  samples: number;
  legacy_id: string;
  confidence: number;
  created_at: string;
  related_gang_id: null;
  related_incident_id: null;
}

export interface GbrainPage {
  slug: string;
  type: "baseline" | "pattern";
  title: string;
  compiledTruth: string;
  frontmatter: GbrainFrontmatter;
  tags: string[];
}

export const DISPARITY_CAPTION =
  "Proxy equity signal derived from reported-incident volume + clearance " +
  "outcomes only. This is NOT the under-policing (reports/responses) or " +
  "indiscriminate (stops/incidents) ratio — those require dispatch-response " +
  "and stop data this system does not have. Treat as a starting lens, not " +
  "a conclusion.";

export function slugifyNeighborhood(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fm(
  kind: "baseline" | "pattern",
  legacyId: string,
  samples: number,
  createdAt: string,
): GbrainFrontmatter {
  return {
    kind,
    meta: {},
    source: "datasf",
    samples,
    legacy_id: legacyId,
    confidence: 1.0,
    created_at: createdAt,
    related_gang_id: null,
    related_incident_id: null,
  };
}

function arrow(pct: number): string {
  if (pct > 0) return `▲${pct}%`;
  if (pct < 0) return `▼${Math.abs(pct)}%`;
  return "→0%";
}

function neighborhoodBody(n: NeighborhoodBaseline): string {
  const cats = n.categoryMix
    .map((c) => `- ${c.category}: ${c.count} (${c.sharePct}%)`)
    .join("\n");
  return [
    `Real SFPD incident baseline for **${n.neighborhood}** (DataSF, ` +
      `confirmed reports).`,
    "",
    `**Windows:** 7d ${n.windows.d7} · 30d ${n.windows.d30} · 90d ` +
      `${n.windows.d90} · 365d ${n.windows.d365}`,
    `**Trend:** ${arrow(n.trendPct)} (current 30d vs prior 30d)`,
    `**Clearance:** ${n.clearance.enforcement} enforcement · ` +
      `${n.clearance.unfounded} unfounded · ${n.clearance.open} open ` +
      `→ rate ${(n.clearance.rate * 100).toFixed(1)}%`,
    "",
    "**Top categories:**",
    cats,
  ].join("\n");
}

export function buildPages(
  agg: AggregateResult,
  now: Date,
  topN: number,
): GbrainPage[] {
  const createdAt = now.toISOString();
  const pages: GbrainPage[] = [];

  const top = agg.neighborhoods.slice(0, topN);
  for (const n of top) {
    const s = slugifyNeighborhood(n.neighborhood);
    pages.push({
      slug: `baseline-datasf-sf-${s}`,
      type: "baseline",
      title:
        `${n.neighborhood} · ${n.total} incidents · ` +
        `${(n.clearance.rate * 100).toFixed(0)}% cleared · ` +
        `${arrow(n.trendPct)} 30d`,
      compiledTruth: neighborhoodBody(n),
      frontmatter: fm(
        "baseline",
        `datasf-baseline-sf-${s}`,
        n.total,
        createdAt,
      ),
      tags: [
        `baseline:${s}`,
        "feed:datasf_sfpd_incidents",
        "source:datasf",
      ],
    });
  }

  const rollupRows = agg.neighborhoods
    .map(
      (n) =>
        `| ${n.neighborhood} | ${n.total} | ${n.windows.d30} | ` +
        `${arrow(n.trendPct)} | ${(n.clearance.rate * 100).toFixed(1)}% |`,
    )
    .join("\n");
  pages.push({
    slug: "baseline-datasf-sf-rollup",
    type: "baseline",
    title: `SF DataSF baseline · ${agg.neighborhoods.length} neighborhoods · ${agg.totalIncidents} incidents`,
    compiledTruth: [
      "SF-wide real SFPD incident baseline (DataSF). All neighborhoods.",
      "",
      "| Neighborhood | Total | 30d | Trend | Clearance |",
      "|---|---|---|---|---|",
      rollupRows,
      "",
      `Unknown/anonymized-neighborhood rows excluded: ${agg.unknownCount}.`,
    ].join("\n"),
    frontmatter: fm(
      "baseline",
      "datasf-baseline-sf-rollup",
      agg.totalIncidents,
      createdAt,
    ),
    tags: ["baseline:sf-rollup", "feed:datasf_sfpd_incidents", "source:datasf"],
  });

  const volTop = agg.disparity.byVolume[0];
  const clrLow = agg.disparity.byClearance[0];
  pages.push({
    slug: "pattern-datasf-sf-neighborhood-disparity",
    type: "pattern",
    title: `SF neighborhood disparity · volume spread ${agg.disparity.volumeSpreadRatio.toFixed(1)}×`,
    compiledTruth: [
      "Cross-neighborhood disparity from real DataSF incidents.",
      "",
      `**Highest volume:** ${volTop ? `${volTop.neighborhood} (${volTop.total})` : "—"}`,
      `**Lowest clearance:** ${clrLow ? `${clrLow.neighborhood} (${(clrLow.rate * 100).toFixed(1)}%)` : "—"}`,
      `**Volume spread (max/min):** ${agg.disparity.volumeSpreadRatio.toFixed(1)}×`,
      "",
      `> ${DISPARITY_CAPTION}`,
    ].join("\n"),
    frontmatter: fm(
      "pattern",
      "datasf-pattern-sf-neighborhood-disparity",
      agg.totalIncidents,
      createdAt,
    ),
    tags: [
      "trend:neighborhood-disparity",
      "feed:datasf_sfpd_incidents",
      "source:datasf",
    ],
  });

  return pages;
}
