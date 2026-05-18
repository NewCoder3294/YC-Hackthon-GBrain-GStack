// Client-shaped view of a row from `live_incidents`. The DB row carries
// `raw` jsonb and bookkeeping fields we don't need to push to the
// browser, so server pages project to this shape before passing to map
// components. Mirrors the columns surfaced on /map and /live.

export type LiveIncidentSource =
  | "sfpd_cad"
  | "sf_fire_ems"
  | "sf_311"
  | "sfpd_reports"
  | "511_traffic"
  | "511_transit";

export type LiveIncidentKind =
  | "police"
  | "fire"
  | "ems"
  | "311"
  | "traffic"
  | "transit";

export type LiveIncidentSeverity = "low" | "med" | "high";

export type LiveIncidentGeoPrecision =
  | "exact"
  | "intersection"
  | "neighborhood"
  | "unknown";

export interface LiveIncident {
  id: string;
  source: LiveIncidentSource;
  sourceUid: string;
  kind: LiveIncidentKind;
  title: string;
  subtitle: string | null;
  severity: LiveIncidentSeverity;
  priority: string | null;
  status: string | null;
  lat: number;
  lng: number;
  geoPrecision: LiveIncidentGeoPrecision;
  neighborhood: string | null;
  address: string | null;
  occurredAt: string;
  acknowledgedAt: string | null;
  /**
   * Count of distinct OTHER sources that produced an incident within
   * 200m / ±10min. >= 1 means cross-source verification. Computed by
   * the `live_incidents_verification` SQL view; absent when the loader
   * didn't enrich.
   */
  corroboratingSources?: number;
}

export const SOURCE_LABEL: Record<LiveIncidentSource, string> = {
  sfpd_cad: "SFPD Calls",
  sf_fire_ems: "Fire/EMS",
  sf_311: "311",
  sfpd_reports: "SFPD Reports",
  "511_traffic": "Traffic",
  "511_transit": "Transit",
};

export const KIND_LABEL: Record<LiveIncidentKind, string> = {
  police: "PD",
  fire: "Fire",
  ems: "EMS",
  "311": "311",
  traffic: "Traffic",
  transit: "Transit",
};

// Single-char glyph for each kind — used by the monochrome map markers.
// Per the design spec, status is communicated via icon shape + motion,
// never hue.
export const KIND_GLYPH: Record<LiveIncidentKind, string> = {
  police: "●",
  fire: "▲",
  ems: "+",
  "311": "◆",
  traffic: "→",
  transit: "▮",
};

export function isHighSeverity(severity: LiveIncidentSeverity): boolean {
  return severity === "high";
}

// Relative time helper shared between marker tooltips and panels.
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const m = Math.round(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
