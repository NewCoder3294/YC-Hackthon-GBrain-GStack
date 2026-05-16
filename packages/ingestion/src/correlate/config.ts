/**
 * Named constants for the correlator. No magic numbers anywhere in the
 * pipeline — every threshold, weight and mapping lives here, documented
 * and tunable.
 */

/** Live correlation window: only signals this fresh are clustered. */
export const WINDOW_HOURS = 48;

/** How far back DataSF rows are read to build neighborhood baselines. */
export const BASELINE_DAYS = 365;

/** Two signals within this many metres may belong to one incident. */
export const RADIUS_M = 150;

/** Max gap (minutes) from a cluster's latest signal to still join it. */
export const TIME_GAP_MIN = 20;

/** Just-outside-radius (≤ factor×RADIUS_M) + strong category → ambiguous. */
export const AMBIGUOUS_RADIUS_FACTOR = 1.5;

/** Composite priority weights (sum ≈ 1). */
export const WEIGHTS = {
  corroboration: 0.3,
  severity: 0.35,
  anomaly: 0.2,
  equity: 0.15,
} as const;

/** Composite-score cutoffs; below P3 cutoff → P4. Strictly descending. */
export const TIER_THRESHOLDS = { P1: 0.75, P2: 0.5, P3: 0.25 } as const;

/**
 * Ordered [pattern, affinityGroup, severity 0..1]. First match wins.
 * Mirrors the keyword approach in calls/summarize.ts.
 */
export const CATEGORY_AFFINITY: ReadonlyArray<
  readonly [RegExp, string, number]
> = [
  [/shots?\s*fired|gunfire|gunshot|firearm|weapon|armed/i, "weapons-violence", 1.0],
  [/homicide|stabb|knife|shooting/i, "weapons-violence", 1.0],
  [/assault|battery|fight|brawl|jumped/i, "assault", 0.8],
  [/robb|mugg/i, "robbery", 0.75],
  [/medical|ambulance|bleeding|unconscious|not moving/i, "medical", 0.7],
  [/burglary|breaking|trespass/i, "property", 0.5],
  [/larceny|theft|stole|shoplift|vandal|graffiti/i, "property", 0.4],
  [/vehicle|car|sedan|traffic|collision|\bdui\b/i, "vehicle", 0.4],
  [/person|pedestrian|loiter|disturbance|noise/i, "presence", 0.3],
  [/false alarm|cancel|firecracker|unfounded/i, "ambiguous", 0.2],
];

/** SFPD CAD call priority → severity, when present in a payload. */
export const PRIORITY_SEVERITY: Record<string, number> = {
  A: 1.0,
  B: 0.7,
  C: 0.4,
  E: 0.2,
};

/** Severity for signals whose category matches no affinity pattern. */
export const UNKNOWN_SEVERITY = 0.3;

/** Confidence applied when a signal_events row has none. */
export const DEFAULT_CONFIDENCE = 0.5;
