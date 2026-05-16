// SFPD Real-Time Calls for Service — DataSF resource `gnap-fj3t`.
// Refreshes every 10 minutes with ~10 min source-side lag; we poll
// every 15 min.
//
// Schema (key fields we use):
//   cad_number               — unique CAD call number (source_uid)
//   received_datetime        — when call was received (occurred_at)
//   call_type_original       — code, e.g., "917"
//   call_type_original_desc  — text, e.g., "Suspicious person"
//   call_type_final / _desc  — final classification after dispatch
//   priority_original        — A/B/C/E
//   priority_final
//   intersection_point       — Socrata Point geometry (often missing)
//   analysis_neighborhood    — text, used for fallback geocoding
//   intersection_name        — text address
//   onview_flag              — "Y" if officer-initiated
//   sensitive_call           — "true" → row may be redacted
//   disposition              — final status text

import type { NewLiveIncident } from "@caltrans/db";
import {
  socrataFetch,
  socrataTimestamp,
  utcIsoToLANaive,
  extractLatLng,
  type SocrataDeps,
  type SocrataPoint,
} from "./datasf-base";
import { lookupNeighborhoodCentroid } from "../sf-neighborhoods";

export const SFPD_CAD_SOURCE = "sfpd_cad";
export const SFPD_CAD_RESOURCE = "gnap-fj3t";

interface SFPDCadRow {
  cad_number?: string;
  received_datetime?: string;
  call_type_original?: string;
  call_type_original_desc?: string;
  call_type_final?: string;
  call_type_final_desc?: string;
  priority_original?: string;
  priority_final?: string;
  intersection_point?: SocrataPoint;
  analysis_neighborhood?: string;
  intersection_name?: string;
  disposition?: string;
  onview_flag?: string;
  sensitive_call?: string | boolean;
}

// SFPD priority A/B → high severity; C → med; E → low. Default low.
function severityFromPriority(priority: string | undefined): "low" | "med" | "high" {
  const p = (priority ?? "").toUpperCase().trim();
  if (p === "A" || p === "B") return "high";
  if (p === "C") return "med";
  return "low";
}

export interface SFPDCadFetchOptions {
  /** ISO timestamp; only return rows received after this time. */
  since?: string;
  /** Max rows per fetch (default 1000). */
  limit?: number;
}

export async function fetchSFPDCad(
  deps: SocrataDeps,
  opts: SFPDCadFetchOptions = {},
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const whereClauses: string[] = ["received_datetime IS NOT NULL"];
  if (opts.since) {
    // Socrata compares string literals against its naive Pacific-time
    // stored values; convert our UTC cursor back to PT-naive first.
    whereClauses.push(`received_datetime > '${utcIsoToLANaive(opts.since)}'`);
  }
  const raw = await socrataFetch<SFPDCadRow>(
    SFPD_CAD_RESOURCE,
    {
      where: whereClauses.join(" AND "),
      order: "received_datetime DESC",
      limit: opts.limit ?? 1000,
    },
    deps,
  );

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  for (const r of raw) {
    if (!r.cad_number) continue;
    const occurredAt = socrataTimestamp(r.received_datetime);
    if (!occurredAt) continue;

    // Skip sensitive/redacted rows — they're partial and noisy.
    const sensitive =
      typeof r.sensitive_call === "string"
        ? r.sensitive_call.toLowerCase() === "true"
        : r.sensitive_call === true;
    if (sensitive) continue;

    // Geo: prefer intersection_point; fall back to neighborhood centroid.
    let lat: number | null = null;
    let lng: number | null = null;
    let geoPrecision: "exact" | "intersection" | "neighborhood" | "unknown" =
      "unknown";
    const pt = extractLatLng(r.intersection_point);
    if (pt) {
      lat = pt.lat;
      lng = pt.lng;
      geoPrecision = "intersection";
    } else {
      const centroid = lookupNeighborhoodCentroid(r.analysis_neighborhood);
      if (centroid) {
        lat = centroid.lat;
        lng = centroid.lng;
        geoPrecision = "neighborhood";
      }
    }
    // Drop rows with no usable geo — honesty over volume.
    if (lat == null || lng == null) continue;

    const priority = r.priority_final ?? r.priority_original ?? null;
    const title =
      r.call_type_final_desc?.trim() ||
      r.call_type_original_desc?.trim() ||
      r.call_type_final?.trim() ||
      r.call_type_original?.trim() ||
      "SFPD Call";
    const subtitleParts: string[] = [];
    if (r.intersection_name) subtitleParts.push(r.intersection_name);
    if (r.analysis_neighborhood) subtitleParts.push(r.analysis_neighborhood);

    rows.push({
      source: SFPD_CAD_SOURCE,
      sourceUid: r.cad_number,
      kind: "police",
      title,
      subtitle: subtitleParts.join(" · ") || null,
      severity: severityFromPriority(priority ?? undefined),
      priority: priority ?? null,
      status: r.disposition ?? null,
      lat,
      lng,
      geoPrecision,
      neighborhood: r.analysis_neighborhood ?? null,
      address: r.intersection_name ?? null,
      occurredAt,
      raw: r as Record<string, unknown>,
    });

    if (!highWaterMark || occurredAt > highWaterMark) highWaterMark = occurredAt;
  }
  return { rows, highWaterMark };
}
