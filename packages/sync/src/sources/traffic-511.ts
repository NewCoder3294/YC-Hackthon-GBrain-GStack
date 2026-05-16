// 511 SF Bay Area Traffic Events — `api.511.org/traffic/events`.
//
// Returns all 9-county Bay-Area incidents and planned events. We filter
// inclusively to SF: any event whose geography intersects the SF bbox.
// Polled every 5 min.
//
// Response shape (Open511-compatible):
//   { events: [
//       { id, status, severity, headline, description,
//         event_type, event_subtypes[], updated, created, ...,
//         geography: { type: "Point"|"LineString", coordinates: ... },
//         roads: [ { name, direction, from, to } ] } ] }

import type { NewLiveIncident } from "@caltrans/db";
import { sf511Fetch, type SF511Deps } from "./sf511-base";
import { isInsideSF } from "../sf-bounds";

export const TRAFFIC_511_SOURCE = "511_traffic";

interface TrafficEvent {
  id?: string;
  status?: string;
  severity?: string;
  headline?: string;
  description?: string;
  event_type?: string;
  event_subtypes?: string[];
  updated?: string;
  created?: string;
  geography?: {
    type?: string;
    coordinates?: number[] | number[][] | number[][][];
  };
  roads?: { name?: string; direction?: string; from?: string; to?: string }[];
}

interface TrafficResponse {
  events?: TrafficEvent[];
}

// 511 severity values: "Severe" | "Major" | "Moderate" | "Minor" | "Unknown".
function severityFor(raw: string | undefined): "low" | "med" | "high" {
  const s = (raw ?? "").toLowerCase();
  if (s === "severe" || s === "major") return "high";
  if (s === "moderate") return "med";
  return "low";
}

// Walk arbitrarily-nested coordinate arrays and yield each [lng, lat] pair.
function* coordPairs(
  coords: number[] | number[][] | number[][][] | undefined,
): Generator<[number, number]> {
  if (!coords) return;
  // Point → number[]; LineString → number[][]; MultiLine/Polygon → number[][][]
  if (typeof coords[0] === "number") {
    const arr = coords as number[];
    if (arr.length >= 2) yield [arr[0]!, arr[1]!];
    return;
  }
  for (const c of coords as (number[] | number[][])[]) {
    yield* coordPairs(c);
  }
}

function pickRepresentativeCoord(
  ev: TrafficEvent,
): { lat: number; lng: number } | null {
  for (const [lng, lat] of coordPairs(ev.geography?.coordinates)) {
    if (isInsideSF(lat, lng)) return { lat, lng };
  }
  // Not in SF.
  return null;
}

function parseUpdated(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface Traffic511FetchOptions {
  limit?: number;
}

export async function fetchTraffic511(
  deps: SF511Deps,
  opts: Traffic511FetchOptions = {},
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const params: Record<string, string> = { format: "json" };
  if (opts.limit) params.limit = String(opts.limit);

  const data = await sf511Fetch<TrafficResponse>("/traffic/events", params, deps);
  const events = data.events ?? [];

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  for (const ev of events) {
    if (!ev.id) continue;
    const coord = pickRepresentativeCoord(ev);
    if (!coord) continue;
    const occurredAt = parseUpdated(ev.created ?? ev.updated);
    if (!occurredAt) continue;

    const roadName = ev.roads?.[0]?.name ?? "";
    const roadDir = ev.roads?.[0]?.direction ?? "";
    const title =
      ev.headline?.trim() ||
      [ev.event_type, roadName].filter(Boolean).join(" · ") ||
      "Traffic event";

    const subtitleParts: string[] = [];
    if (roadDir && roadName) subtitleParts.push(`${roadName} ${roadDir}`);
    else if (roadName) subtitleParts.push(roadName);
    if (ev.event_subtypes?.length) subtitleParts.push(ev.event_subtypes.join(", "));

    rows.push({
      source: TRAFFIC_511_SOURCE,
      sourceUid: ev.id,
      kind: "traffic",
      title,
      subtitle: subtitleParts.join(" · ") || ev.description?.slice(0, 200) || null,
      severity: severityFor(ev.severity),
      priority: ev.severity ?? null,
      status: ev.status ?? null,
      lat: coord.lat,
      lng: coord.lng,
      geoPrecision: "exact",
      neighborhood: null,
      address: roadName || null,
      occurredAt,
      raw: ev as Record<string, unknown>,
    });

    const cursor = parseUpdated(ev.updated) ?? occurredAt;
    if (!highWaterMark || cursor > highWaterMark) highWaterMark = cursor;
  }
  return { rows, highWaterMark };
}
