/**
 * Greedy, deterministic space + time + category clustering.
 *
 * A signal JOINS an open cluster when it is within RADIUS_M, within
 * TIME_GAP_MIN of the cluster's latest signal, AND shares the cluster's
 * affinity group. Borderline cases (in-radius but different group, or
 * just-outside-radius but same group) are NOT auto-merged — the signal
 * starts its own cluster and an AmbiguousMerge is recorded for the
 * adjudicator (pipeline.ts) to resolve. Order-stable: signals are sorted
 * by (occurredAt, id) and cluster ids derive from the sorted member id
 * set, so the same input always yields the same output.
 */

import { AMBIGUOUS_RADIUS_FACTOR, RADIUS_M, TIME_GAP_MIN } from "./config";
import { haversineMeters } from "./geo";
import type { AmbiguousMerge, CandidateCluster, LiveSignal } from "./types";

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

interface OpenCluster {
  ref: number;
  signals: LiveSignal[];
  affinity: string; // seed signal's affinity group
}

function mode(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? "Unknown";
  let bestN = -1;
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && v.localeCompare(best) < 0)) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function minDistanceMeters(s: LiveSignal, c: OpenCluster): number {
  let d = Infinity;
  for (const m of c.signals) {
    const dd = haversineMeters(s.lat, s.lng, m.lat, m.lng);
    if (dd < d) d = dd;
  }
  return d;
}

function withinTime(s: LiveSignal, c: OpenCluster): boolean {
  const latest = c.signals[c.signals.length - 1];
  if (latest === undefined) return true;
  const gapMs = Math.abs(
    new Date(s.occurredAt).getTime() - new Date(latest.occurredAt).getTime(),
  );
  return gapMs <= TIME_GAP_MIN * 60_000;
}

function finalize(c: OpenCluster): CandidateCluster {
  const ids = c.signals.map((s) => s.id).sort();
  const sources = new Set(c.signals.map((s) => s.source));
  return {
    id: `incident-${fnv1a(ids.join(","))}`,
    signals: [...c.signals].sort((a, b) =>
      a.occurredAt === b.occurredAt
        ? a.id.localeCompare(b.id)
        : a.occurredAt.localeCompare(b.occurredAt),
    ),
    neighborhood: mode(c.signals.map((s) => s.neighborhood)),
    hasDatasfDup: sources.has("datasf") && sources.has("call_911"),
  };
}

export function cluster(signals: readonly LiveSignal[]): {
  clusters: CandidateCluster[];
  ambiguous: AmbiguousMerge[];
} {
  const sorted = [...signals].sort((a, b) =>
    a.occurredAt === b.occurredAt
      ? a.id.localeCompare(b.id)
      : a.occurredAt.localeCompare(b.occurredAt),
  );

  const open: OpenCluster[] = [];
  const ambiguousRaw: {
    signalId: string;
    ref: number;
    reason: AmbiguousMerge["reason"];
    distanceM: number;
  }[] = [];
  let nextRef = 0;

  for (const s of sorted) {
    let joinTarget: OpenCluster | null = null;
    let joinDist = Infinity;
    let ambBest: { ref: number; reason: AmbiguousMerge["reason"]; d: number } | null =
      null;

    for (const c of open) {
      if (!withinTime(s, c)) continue;
      const d = minDistanceMeters(s, c);
      const sameGroup =
        s.affinityGroup === c.affinity && s.affinityGroup !== "unknown";

      if (d <= RADIUS_M && sameGroup) {
        if (d < joinDist) {
          joinDist = d;
          joinTarget = c;
        }
      } else if (d <= RADIUS_M && !sameGroup) {
        if (ambBest === null || d < ambBest.d)
          ambBest = { ref: c.ref, reason: "category-mismatch-in-radius", d };
      } else if (d <= AMBIGUOUS_RADIUS_FACTOR * RADIUS_M && sameGroup) {
        if (ambBest === null || d < ambBest.d)
          ambBest = { ref: c.ref, reason: "category-match-near-radius", d };
      }
    }

    if (joinTarget !== null) {
      joinTarget.signals.push(s);
      continue;
    }

    const fresh: OpenCluster = {
      ref: nextRef++,
      signals: [s],
      affinity: s.affinityGroup,
    };
    open.push(fresh);
    if (ambBest !== null) {
      ambiguousRaw.push({
        signalId: s.id,
        ref: ambBest.ref,
        reason: ambBest.reason,
        distanceM: Math.round(ambBest.d),
      });
    }
  }

  const finalById = new Map<number, CandidateCluster>();
  for (const c of open) finalById.set(c.ref, finalize(c));

  const ambiguous: AmbiguousMerge[] = ambiguousRaw.map((a) => ({
    signalId: a.signalId,
    clusterId: finalById.get(a.ref)!.id,
    reason: a.reason,
    distanceM: a.distanceM,
  }));

  return { clusters: [...finalById.values()], ambiguous };
}
