export type KgNodeKind =
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
  incident: "Incident",
  pattern: "Pattern",
  baseline: "Baseline",
  location: "Location",
  decision: "Decision",
};

export const KIND_ORDER: KgNodeKind[] = [
  "location",
  "incident",
  "decision",
  "pattern",
  "baseline",
];

export const KIND_COLUMN: Record<KgNodeKind, number> = {
  location: 0,
  incident: 1,
  decision: 2,
  pattern: 3,
  baseline: 4,
};
