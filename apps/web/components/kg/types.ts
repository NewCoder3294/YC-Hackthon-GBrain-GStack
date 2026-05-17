export type KgNodeKind =
  | "gang"
  | "member"
  | "territory"
  | "arrest"
  | "event"
  | "alert"
  | "incident"
  | "pattern"
  | "baseline"
  | "location"
  | "decision"
  | "dispatch"
  | "web_context";

export interface KgNode {
  id: string;
  kind: KgNodeKind;
  label: string;
  sub?: string;
  meta?: Record<string, string | number>;
  source?: "live" | "fixture";
  neighborhood?: string; // derived server-side in data.ts
}

export interface KgEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export const KIND_LABEL: Record<KgNodeKind, string> = {
  gang: "Gang",
  member: "Member",
  territory: "Territory",
  arrest: "Arrest",
  event: "Event",
  alert: "Alert",
  incident: "Incident",
  pattern: "Pattern",
  baseline: "Baseline",
  location: "Location",
  decision: "Decision",
  dispatch: "Dispatch",
  web_context: "Web context",
};

// Display order in toolbar (groups: people → places → history → live → analysis)
export const KIND_ORDER: KgNodeKind[] = [
  "gang",
  "member",
  "territory",
  "arrest",
  "event",
  "location",
  "dispatch",
  "incident",
  "alert",
  "decision",
  "pattern",
  "baseline",
  "web_context",
];

// Columnar layout. Lower = more leftward.
export const KIND_COLUMN: Record<KgNodeKind, number> = {
  gang: 0,
  member: 1,
  territory: 1,
  arrest: 2,
  event: 2,
  location: 2,
  dispatch: 3,
  incident: 3,
  alert: 4,
  decision: 5,
  pattern: 6,
  baseline: 7,
  web_context: 8,
};

// --- Overview/Detail redesign types ---

/** A neighborhood cluster bubble in the Tier-1 overview. */
export interface NeighborhoodCluster {
  neighborhood: string;
  nodeIds: string[];
  incidentCount: number;
  alertCount: number; // unacknowledged
  maxSeverity: number; // 0 when no incidents; otherwise the max incident severity in this neighborhood
}

/** Aggregated arc between two neighborhood clusters (endpoints are neighborhood names). */
export interface ClusterEdge {
  id: string;
  from: string; // neighborhood name
  to: string;   // neighborhood name
  weight: number;
}

/** Collapsed "+N <kind> ⊕" stub in the Tier-2 detail view. */
export interface StubNode {
  id: string; // synthetic, format: `stub:${neighborhood}:${kind}`
  neighborhood: string;
  kind: KgNodeKind;
  count: number;
}

/** Which tier the KG is showing: the overview map or one neighborhood's detail. */
export type KgView =
  | { mode: "overview" }
  | { mode: "detail"; neighborhood: string };
