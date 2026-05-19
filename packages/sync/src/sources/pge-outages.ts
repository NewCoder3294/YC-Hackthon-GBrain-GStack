// PG&E residential outage feed.
//
// Public JSON endpoint at:
//   https://ewx.pge.com/OMSExternal/CallCenter/getOutagesJson
//
// PG&E does not document this as a stable API, but the feed has powered
// third-party dashboards (e.g. outages.pge.com itself) since ~2019 and
// rotates infrequently. The response shape is:
//
//   {
//     outagesList: [
//       {
//         outageId: "BMN-1234567",
//         outageStartTime: "2026-05-18T03:14:22-07:00",
//         estimatedRestoreTime: "2026-05-18T09:30:00-07:00",
//         cause: "Under investigation",
//         status: "Crew Assigned" | "Restoration in progress" | ...,
//         impactedCustomers: 142,
//         latitude: 37.7812,
//         longitude: -122.4123,
//         city: "San Francisco",
//         county: "San Francisco",
//         ...
//       },
//       ...
//     ]
//   }
//
// We restrict to SF by bounding box (PG&E's `city` field is unreliable —
// outages near city borders show up as "Daly City" or "South SF" even
// when the geometry sits inside SF). Polled every 10 min; SF outages
// are sparse so the rate is generous.

import type { NewLiveIncident } from "@caltrans/db";
import { isInsideSF } from "../sf-bounds";

export const PGE_OUTAGES_SOURCE = "pge_outages";
export const PGE_OUTAGES_URL =
  "https://ewx.pge.com/OMSExternal/CallCenter/getOutagesJson";

interface PGEOutageRow {
  outageId?: string;
  outageStartTime?: string;
  estimatedRestoreTime?: string;
  cause?: string;
  status?: string;
  impactedCustomers?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  city?: string;
  county?: string;
  crewStatus?: string;
}

interface PGEResponse {
  outagesList?: PGEOutageRow[];
}

export interface PGEOutagesDeps {
  fetch: typeof globalThis.fetch;
  /** Override endpoint (tests). */
  endpoint?: string;
}

// PG&E severity heuristic: scaled by impactedCustomers because PG&E does
// not provide a severity field. Thresholds match the SF planner's
// rule-of-thumb (a single transformer = ~50 customers, a feeder = ~1k).
function severityFor(impacted: number): "low" | "med" | "high" {
  if (impacted >= 1000) return "high";
  if (impacted >= 100) return "med";
  return "low";
}

function parseTimestamp(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(v: number | string | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchPGEOutages(
  deps: PGEOutagesDeps,
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const url = deps.endpoint ?? PGE_OUTAGES_URL;
  const res = await deps.fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `PG&E outages fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as PGEResponse;
  const list = data.outagesList ?? [];

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  for (const o of list) {
    if (!o.outageId) continue;
    const lat = toNumber(o.latitude);
    const lng = toNumber(o.longitude);
    if (lat == null || lng == null) continue;
    if (!isInsideSF(lat, lng)) continue;

    const occurredAt = parseTimestamp(o.outageStartTime);
    if (!occurredAt) continue;

    const impacted = toNumber(o.impactedCustomers) ?? 0;
    const eta = parseTimestamp(o.estimatedRestoreTime);

    const title = o.cause?.trim() || "Power outage";
    const subtitleParts: string[] = [
      `${impacted} customer${impacted === 1 ? "" : "s"} affected`,
    ];
    if (eta) {
      subtitleParts.push(`ETA ${eta.toISOString()}`);
    }
    if (o.crewStatus) subtitleParts.push(o.crewStatus);

    rows.push({
      source: PGE_OUTAGES_SOURCE,
      sourceUid: o.outageId,
      kind: "outage",
      title,
      subtitle: subtitleParts.join(" · "),
      severity: severityFor(impacted),
      priority: String(impacted),
      status: o.status ?? null,
      lat,
      lng,
      geoPrecision: "exact",
      neighborhood: null,
      address: o.city ?? null,
      occurredAt,
      raw: o as Record<string, unknown>,
    });

    if (!highWaterMark || occurredAt > highWaterMark) {
      highWaterMark = occurredAt;
    }
  }
  return { rows, highWaterMark };
}
