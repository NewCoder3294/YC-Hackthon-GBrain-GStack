import type { FusionCluster } from "./fusion";
import { getConfig } from "./config";

/**
 * Deterministic priority filter that runs BEFORE any LLM call. The whole
 * point: every signal that survives fusion has a real cost downstream
 * (HTTP POST, Supabase write, possibly an LLM call). We aggressively trim
 * here using cheap heuristics so the expensive paths see only candidates
 * worth the spend.
 *
 * Rules (deterministic):
 *   1. Drop clusters with members < ENRICH_MIN_MEMBERS (default 3).
 *      Fusion already requires 2, but 2-event clusters are mostly noise
 *      at scale — single cameras flapping or duplicate detections.
 *   2. Drop clusters whose max confidence < ENRICH_MIN_CONFIDENCE (0.4).
 *      Vision-model detections under that bar are almost always false.
 *   3. Drop "single source flapping" clusters: 1 distinct source_id firing
 *      repeatedly at one corner. Same camera detecting the same scene over
 *      and over is not 3 incidents.
 *   4. Rank surviving clusters by a priority score (multi-source > many-
 *      member > confidence) so when we per-tick-cap, we keep the most
 *      consequential ones.
 */

export interface RankedCluster {
  cluster: FusionCluster;
  priority: number;
  reasons: string[];
}

export function priorityScore(c: FusionCluster): {
  score: number;
  reasons: string[];
} {
  const distinctSourceTypes = Object.keys(c.sourceTypeCounts).length;
  const distinctSourceIds = new Set(c.members.map((m) => m.sourceId)).size;
  const maxConf = Math.max(0, ...c.members.map((m) => m.confidence ?? 0));

  const reasons: string[] = [];
  let score = 0;

  // Multi-source-type is the biggest predictor of "real incident".
  score += distinctSourceTypes * 10;
  if (distinctSourceTypes >= 2) reasons.push(`multi-source(${distinctSourceTypes})`);

  // Multiple cameras / callers at one corner > single source flapping.
  score += Math.min(distinctSourceIds, 5) * 3;
  if (distinctSourceIds >= 2) reasons.push(`multi-id(${distinctSourceIds})`);

  // Member count — diminishing returns past 10.
  score += Math.min(c.members.length, 10);
  reasons.push(`n=${c.members.length}`);

  // Confidence boost — > 0.7 is strong signal.
  if (maxConf >= 0.7) {
    score += Math.round(maxConf * 10);
    reasons.push(`conf=${maxConf.toFixed(2)}`);
  }

  return { score, reasons };
}

export function rankAndFilter(clusters: FusionCluster[]): RankedCluster[] {
  const cfg = getConfig();
  const survivors: RankedCluster[] = [];

  for (const c of clusters) {
    if (c.members.length < cfg.ENRICH_MIN_MEMBERS) continue;

    const maxConf = Math.max(0, ...c.members.map((m) => m.confidence ?? 0));
    if (maxConf < cfg.ENRICH_MIN_CONFIDENCE) continue;

    const distinctSourceIds = new Set(c.members.map((m) => m.sourceId)).size;
    const distinctSourceTypes = Object.keys(c.sourceTypeCounts).length;
    if (distinctSourceIds === 1 && distinctSourceTypes === 1) {
      // Single source flapping — usually noise. But sustained high-confidence
      // detection at one camera IS interesting (sustained traffic, ongoing
      // activity at a corner). Let those through.
      const sustainedHighConf =
        c.members.length >= 5 && maxConf >= 0.7;
      if (!sustainedHighConf) continue;
    }

    const { score, reasons } = priorityScore(c);
    survivors.push({ cluster: c, priority: score, reasons });
  }

  survivors.sort((a, b) => b.priority - a.priority);
  return survivors;
}
