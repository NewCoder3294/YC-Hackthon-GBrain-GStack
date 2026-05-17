/**
 * Pure builder: ranked incidents → GBrain page objects. Mirrors the
 * exact shape discipline of baseline/pages.ts (page_kind='markdown',
 * frontmatter {kind,meta,source,samples,legacy_id,confidence,created_at,
 * related_gang_id,related_incident_id}). The baseline link is expressed
 * as a tag + frontmatter (consistent with how apps/web kg/data.ts reads
 * GBrain — no separate links table). No IO.
 */

import { slugifyNeighborhood } from "../baseline/pages";
import type { ScoredIncident } from "./types";

export interface IncidentFrontmatter {
  kind: "incident";
  meta: Record<string, never>;
  source: "correlator";
  samples: number;
  legacy_id: string;
  confidence: number;
  created_at: string;
  related_gang_id: null;
  related_incident_id: null;
}

export interface IncidentPage {
  slug: string;
  type: "incident";
  title: string;
  compiledTruth: string;
  timeline: string;
  frontmatter: IncidentFrontmatter;
  tags: string[];
}

function hhmm(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

function meanConfidence(i: ScoredIncident): number {
  const sig = i.cluster.signals;
  return (
    Math.round(
      (sig.reduce((a, s) => a + s.confidence, 0) / sig.length) * 100,
    ) / 100
  );
}

function buildTimeline(i: ScoredIncident): string {
  return i.cluster.signals
    .map((s) => `${hhmm(s.occurredAt)} ${s.source} — ${s.summary}`)
    .join("\n");
}

function buildBody(i: ScoredIncident): string {
  const f = i.factors;
  const span = i.cluster.signals;
  const first = span[0];
  const last = span[span.length - 1];
  const group = first?.affinityGroup ?? "unknown";
  const sources = [...new Set(span.map((s) => s.source))].sort().join(", ");
  return [
    `**${i.tier}** correlated incident in **${i.cluster.neighborhood}** ` +
      `(${group}).`,
    "",
    `**Window:** ${hhmm(first.occurredAt)}–${hhmm(last.occurredAt)} · ` +
      `${span.length} signal(s) · sources: ${sources}` +
      (i.cluster.hasDatasfDup ? " · includes a DataSF filed record" : ""),
    "",
    "| Factor | Score |",
    "|---|---|",
    `| Corroboration | ${f.corroboration.toFixed(2)} |`,
    `| Severity | ${f.severity.toFixed(2)} |`,
    `| Anomaly | ${f.anomaly.toFixed(2)} |`,
    `| Equity | ${f.equity.toFixed(2)} |`,
    `| **Priority** | **${i.priority.toFixed(2)}** |`,
    "",
    `> ${i.rationale || "(no rationale)"}`,
    i.factors.degraded
      ? "\n_Degraded: no neighborhood baseline context was available._"
      : "",
  ].join("\n");
}

export function buildIncidentPages(
  ranked: readonly ScoredIncident[],
  now: Date,
): IncidentPage[] {
  const createdAt = now.toISOString();
  return ranked.map((i) => {
    const nbhdSlug = slugifyNeighborhood(i.cluster.neighborhood);
    const group = i.cluster.signals[0]?.affinityGroup ?? "unknown";
    const sources = [...new Set(i.cluster.signals.map((s) => s.source))].sort();
    const samples = i.cluster.signals.length;
    return {
      slug: i.cluster.id,
      type: "incident",
      title:
        `${i.tier} · ${group} · ${i.cluster.neighborhood} · ` +
        `${samples} signal(s) · p${i.priority.toFixed(2)}`,
      compiledTruth: buildBody(i),
      timeline: buildTimeline(i),
      frontmatter: {
        kind: "incident",
        meta: {},
        source: "correlator",
        samples,
        legacy_id: i.cluster.id,
        confidence: meanConfidence(i),
        created_at: createdAt,
        related_gang_id: null,
        related_incident_id: null,
      },
      tags: [
        "incident",
        `priority:${i.tier}`,
        `neighborhood:${nbhdSlug}`,
        `affinity:${group}`,
        ...sources.map((s) => `source:${s}`),
        `link:baseline-datasf-sf-${nbhdSlug}`,
      ],
    };
  });
}
