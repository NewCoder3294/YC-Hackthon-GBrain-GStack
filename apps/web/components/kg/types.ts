export type KgNodeKind =
  | "gang"
  | "member"
  | "territory"
  | "arrest"
  | "alert"
  | "incident"
  | "pattern"
  | "baseline"
  | "location"
  | "decision";

export interface KgNode {
  id: string;
  kind: KgNodeKind;
  label: string;
  sub?: string;
  meta?: Record<string, string | number>;
  source?: "live" | "fixture";
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
  alert: "Alert",
  incident: "Incident",
  pattern: "Pattern",
  baseline: "Baseline",
  location: "Location",
  decision: "Decision",
};

// Display order in toolbar (groups: people → places → events → analysis)
export const KIND_ORDER: KgNodeKind[] = [
  "gang",
  "member",
  "territory",
  "arrest",
  "location",
  "incident",
  "alert",
  "decision",
  "pattern",
  "baseline",
];

// Columnar layout. Lower = more leftward.
export const KIND_COLUMN: Record<KgNodeKind, number> = {
  gang: 0,
  member: 1,
  territory: 1,
  arrest: 2,
  location: 2,
  incident: 3,
  alert: 4,
  decision: 5,
  pattern: 6,
  baseline: 7,
};
