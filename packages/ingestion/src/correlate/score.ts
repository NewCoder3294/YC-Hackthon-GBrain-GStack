/**
 * Deterministic 4-factor priority score → tier. Pure: every constant
 * comes from config.ts and the result is fully reproducible. The
 * rationale string is filled later by the adjudicator (pipeline.ts).
 */

import {
  CATEGORY_AFFINITY,
  TIER_THRESHOLDS,
  UNKNOWN_SEVERITY,
  WEIGHTS,
  WINDOW_HOURS,
} from "./config";
import type {
  CandidateCluster,
  NeighborhoodContext,
  ScoreFactors,
  ScoredIncident,
  Tier,
} from "./types";

const SEVERITY_BY_GROUP: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const [, group, sev] of CATEGORY_AFFINITY) {
    m[group] = Math.max(m[group] ?? 0, sev);
  }
  return m;
})();

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Distinct sources, with a datasf/call_911 filed-record dup worth 0.5. */
export function corroborationFactor(c: CandidateCluster): number {
  const sources = new Set(c.signals.map((s) => s.source));
  let effective = sources.size;
  if (c.hasDatasfDup) effective -= 0.5;
  return clamp01(effective / 3);
}

/** Highest member severity, from the affinity-group severity table. */
export function severityFactor(c: CandidateCluster): number {
  let max = 0;
  for (const s of c.signals) {
    const sev = SEVERITY_BY_GROUP[s.affinityGroup] ?? UNKNOWN_SEVERITY;
    if (sev > max) max = sev;
  }
  return clamp01(max);
}

/** Burst size vs the neighborhood's expected rate over the live window. */
export function anomaly(
  c: CandidateCluster,
  ctx: NeighborhoodContext,
): { ratio: number; factor: number } {
  if (!ctx.found) return { ratio: 0, factor: 0 };
  const expectedInWindow = Math.max(
    0.5,
    (ctx.baseline30d * WINDOW_HOURS) / (30 * 24),
  );
  const ratio = c.signals.length / expectedInWindow;
  return { ratio, factor: clamp01((ratio - 1) / 4) };
}

export function equityFactor(
  c: CandidateCluster,
  ctx: NeighborhoodContext,
  now: Date,
): number {
  const newest = c.signals.reduce(
    (mx, s) => Math.max(mx, new Date(s.occurredAt).getTime()),
    0,
  );
  const ageMin = Math.max(0, (now.getTime() - newest) / 60_000);
  const recency = Math.exp(-ageMin / 120);
  const meanConf =
    c.signals.reduce((a, s) => a + s.confidence, 0) / c.signals.length;
  return clamp01(
    0.6 * ctx.clearancePercentile + 0.2 * recency + 0.2 * meanConf,
  );
}

function tierFor(priority: number): Tier {
  if (priority >= TIER_THRESHOLDS.P1) return "P1";
  if (priority >= TIER_THRESHOLDS.P2) return "P2";
  if (priority >= TIER_THRESHOLDS.P3) return "P3";
  return "P4";
}

export function scoreIncident(
  c: CandidateCluster,
  ctx: NeighborhoodContext,
  now: Date,
): ScoredIncident {
  const corroboration = corroborationFactor(c);
  const severity = severityFactor(c);
  const an = anomaly(c, ctx);
  const equity = equityFactor(c, ctx, now);
  const factors: ScoreFactors = {
    corroboration,
    severity,
    anomaly: an.factor,
    equity,
    degraded: !ctx.found,
  };
  const priority = clamp01(
    WEIGHTS.corroboration * corroboration +
      WEIGHTS.severity * severity +
      WEIGHTS.anomaly * an.factor +
      WEIGHTS.equity * equity,
  );
  return { cluster: c, factors, priority, tier: tierFor(priority), rationale: "" };
}

/** Highest priority first; ties broken by most-recent signal. */
export function rankIncidents(
  list: readonly ScoredIncident[],
): ScoredIncident[] {
  const newest = (i: ScoredIncident): number =>
    i.cluster.signals.reduce(
      (mx, s) => Math.max(mx, new Date(s.occurredAt).getTime()),
      0,
    );
  return [...list].sort(
    (a, b) => b.priority - a.priority || newest(b) - newest(a),
  );
}
