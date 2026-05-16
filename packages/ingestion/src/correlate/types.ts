/**
 * Shared types for the signal correlator + incident ranker (the
 * interpretation layer). Defined once here; every correlate/* module
 * consumes these unchanged. No behavior — types only.
 */

/** Normalized source bucket (collapses raw signal_events.source_type). */
export type CorrelatorSource = "camera" | "call_911" | "citizen" | "datasf";

/** A single signal_events row normalized for correlation. */
export interface LiveSignal {
  id: string;
  source: CorrelatorSource;
  sourceType: string; // raw signal_events.source_type
  feed: string | null; // payload.feed (datasf rows carry one)
  occurredAt: string; // ISO
  lat: number;
  lng: number;
  category: string; // human category text ("unknown" if none)
  affinityGroup: string; // CATEGORY_AFFINITY group ("unknown" if none)
  confidence: number; // 0..1
  neighborhood: string; // assigned ("Unknown" if none)
  summary: string; // short label for the incident timeline
}

export interface Centroid {
  neighborhood: string;
  lat: number;
  lng: number;
}

/** A correlated group of signals = one candidate incident. */
export interface CandidateCluster {
  id: string; // deterministic from sorted member signal ids
  signals: LiveSignal[]; // chronological
  neighborhood: string; // dominant member neighborhood
  hasDatasfDup: boolean; // a datasf filed-record sits with a live call_911
}

export interface AmbiguousMerge {
  signalId: string;
  clusterId: string;
  reason: "category-mismatch-in-radius" | "category-match-near-radius";
  distanceM: number;
}

/** Per-neighborhood context derived from the DataSF baseline aggregate. */
export interface NeighborhoodContext {
  neighborhood: string;
  baseline30d: number; // incidents in last 30d
  categoryRate: Record<string, number>; // category -> count (baseline window)
  clearanceRate: number; // 0..1
  clearancePercentile: number; // 0..1 (1 = worst-cleared → highest equity)
  found: boolean; // false → degraded scoring
}

export interface ScoreFactors {
  corroboration: number; // 0..1
  severity: number; // 0..1
  anomaly: number; // 0..1
  equity: number; // 0..1
  degraded: boolean; // true when no neighborhood context was available
}

export type Tier = "P1" | "P2" | "P3" | "P4";

export interface ScoredIncident {
  cluster: CandidateCluster;
  factors: ScoreFactors;
  priority: number; // 0..1 weighted composite
  tier: Tier;
  rationale: string; // filled by the adjudicator's narrate()
}
