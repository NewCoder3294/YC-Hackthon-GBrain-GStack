// NWS active weather alerts for California, filtered to the SF bbox.
//
// API: https://www.weather.gov/documentation/services-web-api
// Endpoint: GET https://api.weather.gov/alerts/active?area=CA
// Auth: keyless. NWS requires a descriptive User-Agent per their TOS;
// requests without one can be silently dropped.
//
// Each alert carries one or more geometries (polygon/multipolygon) and/or
// SAME-coded affected zones. We compute a representative point from the
// geometry centroid when present, falling back to the SF city-hall
// coordinate when the alert's affected zones include SF County (FIPS
// 06075, SAME 006075) but no usable polygon was attached.
//
// Severity mapping: NWS exposes `severity` (Minor/Moderate/Severe/Extreme)
// and `certainty`. We collapse Severe + Extreme → high, Moderate → med,
// everything else (including Minor/Unknown) → low.

import type { NewEnvSignal } from "@caltrans/db";
import { SF_BBOX, SF_CITY_HALL } from "../sf-bounds";

export const NWS_ALERTS_SOURCE = "nws_alerts";

const NWS_ENDPOINT = "https://api.weather.gov/alerts/active?area=CA";
// NWS API rejects generic UAs. Identify the project + a reachable contact.
const DEFAULT_USER_AGENT =
  "watchdog-sf (+https://watchdog-yc.vercel.app, contact: ops@watchdog.sf)";

interface NwsGeometry {
  type?: string;
  coordinates?: unknown;
}

interface NwsProperties {
  id?: string;
  event?: string;
  headline?: string | null;
  description?: string | null;
  severity?: string | null;
  certainty?: string | null;
  urgency?: string | null;
  sent?: string | null;
  effective?: string | null;
  onset?: string | null;
  expires?: string | null;
  areaDesc?: string | null;
  senderName?: string | null;
  geocode?: {
    SAME?: string[];
    UGC?: string[];
  } | null;
  affectedZones?: string[] | null;
}

interface NwsFeature {
  id?: string;
  type?: string;
  geometry?: NwsGeometry | null;
  properties?: NwsProperties;
}

interface NwsResponse {
  features?: NwsFeature[];
}

export interface NwsAlertsDeps {
  fetch?: typeof globalThis.fetch;
  /** Override the NWS-required User-Agent. */
  userAgent?: string;
  now?: () => Date;
}

function nwsSeverity(
  severity: string | null | undefined,
): "low" | "med" | "high" {
  const s = (severity ?? "").toLowerCase();
  if (s === "extreme" || s === "severe") return "high";
  if (s === "moderate") return "med";
  return "low";
}

/** Flatten a GeoJSON ring/polygon/multipolygon into bare [lng, lat] pairs. */
function flattenCoords(coords: unknown): [number, number][] {
  const out: [number, number][] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (
      node.length === 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      out.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(coords);
  return out;
}

function centroid(coords: [number, number][]): { lat: number; lng: number } | null {
  if (coords.length === 0) return null;
  let lngSum = 0;
  let latSum = 0;
  for (const [lng, lat] of coords) {
    lngSum += lng;
    latSum += lat;
  }
  return { lat: latSum / coords.length, lng: lngSum / coords.length };
}

function bboxOverlapsSF(coords: [number, number][]): boolean {
  if (coords.length === 0) return false;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const [lng, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  // Rectangle-rectangle overlap.
  return !(
    maxLat < SF_BBOX.minLat ||
    minLat > SF_BBOX.maxLat ||
    maxLng < SF_BBOX.minLng ||
    minLng > SF_BBOX.maxLng
  );
}

function affectsSFCounty(props: NwsProperties): boolean {
  const same = props.geocode?.SAME ?? [];
  if (same.some((s) => s === "006075" || s === "06075")) return true;
  const ugc = props.geocode?.UGC ?? [];
  // CAZ006 / CAC075 / CAZ506 cover the SF coastal zones; be permissive.
  if (ugc.some((u) => /^CA[CZ]0?6075$/.test(u) || /^CAZ5?06$/.test(u))) {
    return true;
  }
  const desc = (props.areaDesc ?? "").toLowerCase();
  return desc.includes("san francisco");
}

export interface NwsAlertsResult {
  attempted: number;
  rows: NewEnvSignal[];
  dropped: number;
}

export async function fetchNwsAlerts(
  deps: NwsAlertsDeps = {},
): Promise<NwsAlertsResult> {
  const fetchFn = deps.fetch ?? fetch;
  const ua = deps.userAgent ?? DEFAULT_USER_AGENT;
  const now = deps.now ? deps.now() : new Date();

  const res = await fetchFn(NWS_ENDPOINT, {
    headers: {
      "User-Agent": ua,
      Accept: "application/geo+json",
    },
  });
  if (!res.ok) {
    throw new Error(`nws_alerts ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as NwsResponse;
  const features = body.features ?? [];

  const rows: NewEnvSignal[] = [];
  let dropped = 0;

  for (const feat of features) {
    const props = feat.properties;
    if (!props) {
      dropped += 1;
      continue;
    }
    const id = props.id ?? feat.id;
    if (!id) {
      dropped += 1;
      continue;
    }

    const coords = flattenCoords(feat.geometry?.coordinates);
    const overlaps = coords.length > 0 ? bboxOverlapsSF(coords) : false;
    const countyMatch = affectsSFCounty(props);
    if (!overlaps && !countyMatch) {
      // SF-irrelevant alert.
      dropped += 1;
      continue;
    }

    const c = centroid(coords) ?? { lat: SF_CITY_HALL.lat, lng: SF_CITY_HALL.lng };

    const occurredAtIso =
      props.onset ?? props.effective ?? props.sent ?? now.toISOString();
    const occurredAt = new Date(occurredAtIso);
    if (Number.isNaN(occurredAt.getTime())) {
      dropped += 1;
      continue;
    }
    const expiresAt = props.expires ? new Date(props.expires) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      dropped += 1;
      continue;
    }

    const title = (props.event ?? props.headline ?? "Weather alert").trim();
    const subtitleParts: string[] = [];
    if (props.severity) subtitleParts.push(props.severity);
    if (props.areaDesc) subtitleParts.push(props.areaDesc);

    rows.push({
      kind: "weather",
      source: NWS_ALERTS_SOURCE,
      sourceUid: id,
      lat: c.lat,
      lng: c.lng,
      severity: nwsSeverity(props.severity),
      title,
      subtitle: subtitleParts.join(" · ") || null,
      occurredAt,
      expiresAt,
      raw: feat as unknown as Record<string, unknown>,
    });
  }

  return { attempted: features.length, rows, dropped };
}
