// SF 311 Cases — DataSF resource `vw6y-z8j6`.
// Nightly refresh; we poll every 6 hours.
//
// Schema (key fields):
//   service_request_id  — unique
//   requested_datetime  — when opened
//   closed_date         — when closed (null if open)
//   updated_datetime    — incremental polling cursor
//   service_name        — high-level category, e.g., "Encampments"
//   service_subtype     — fine-grained
//   service_details     — free-text
//   address             — block-level
//   neighborhoods_sffind_boundaries — text
//   point               — Point geometry
//   status_description  — "Open"/"Closed"

import type { NewLiveIncident } from "@caltrans/db";
import {
  socrataFetch,
  socrataTimestamp,
  utcIsoToLANaive,
  extractLatLng,
  type SocrataDeps,
  type SocrataPoint,
} from "./datasf-base";

export const SF_311_SOURCE = "sf_311";
export const SF_311_RESOURCE = "vw6y-z8j6";

interface SF311Row {
  service_request_id?: string;
  requested_datetime?: string;
  updated_datetime?: string;
  closed_date?: string;
  service_name?: string;
  service_subtype?: string;
  service_details?: string;
  address?: string;
  neighborhoods_sffind_boundaries?: string;
  point?: SocrataPoint;
  lat?: string;
  long?: string;
  status_description?: string;
}

// 311 has no severity; encampments, illegal dumping, blocked driveway etc.
// are all "low" by dispatcher standards. Bump a couple of categories that
// are flagged as urgent in SFDPH/SFFD protocols.
function severityFor(serviceName: string | undefined): "low" | "med" | "high" {
  const s = (serviceName ?? "").toLowerCase();
  if (s.includes("fire hazard") || s.includes("gas")) return "high";
  if (s.includes("encampment") || s.includes("noise report") || s.includes("hazard"))
    return "med";
  return "low";
}

export interface SF311FetchOptions {
  since?: string;
  limit?: number;
}

export async function fetchSF311(
  deps: SocrataDeps,
  opts: SF311FetchOptions = {},
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const whereClauses: string[] = ["requested_datetime IS NOT NULL"];
  if (opts.since) {
    whereClauses.push(`updated_datetime > '${utcIsoToLANaive(opts.since)}'`);
  }
  const raw = await socrataFetch<SF311Row>(
    SF_311_RESOURCE,
    {
      where: whereClauses.join(" AND "),
      order: "updated_datetime DESC",
      limit: opts.limit ?? 1000,
    },
    deps,
  );

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  for (const r of raw) {
    if (!r.service_request_id) continue;
    const occurredAt = socrataTimestamp(r.requested_datetime);
    if (!occurredAt) continue;
    const pt = extractLatLng(r.point, r.lat, r.long);
    if (!pt) continue;

    const title = r.service_name?.trim() || "311 Case";
    const subtitleParts: string[] = [];
    if (r.service_subtype) subtitleParts.push(r.service_subtype);
    if (r.address) subtitleParts.push(r.address);

    rows.push({
      source: SF_311_SOURCE,
      sourceUid: r.service_request_id,
      kind: "311",
      title,
      subtitle: subtitleParts.join(" · ") || null,
      severity: severityFor(r.service_name),
      priority: null,
      status: r.status_description ?? (r.closed_date ? "Closed" : "Open"),
      lat: pt.lat,
      lng: pt.lng,
      geoPrecision: "exact",
      neighborhood: r.neighborhoods_sffind_boundaries ?? null,
      address: r.address ?? null,
      occurredAt,
      raw: r as Record<string, unknown>,
    });

    const cursor = socrataTimestamp(r.updated_datetime) ?? occurredAt;
    if (!highWaterMark || cursor > highWaterMark) highWaterMark = cursor;
  }
  return { rows, highWaterMark };
}
