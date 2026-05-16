// SFPD Incident Reports 2018-Present — DataSF resource `wg3w-h783`.
// SFTP-fed daily; 1-2 day lag from event. Polled every 24h for historical
// context; not a real-time signal.
//
// Schema (key fields):
//   row_id                      — unique
//   incident_id                 — alt id
//   incident_datetime           — when crime occurred
//   incident_category           — e.g., "Larceny Theft"
//   incident_subcategory
//   incident_description
//   resolution                  — e.g., "Open or Active"
//   intersection                — text
//   analysis_neighborhood
//   latitude / longitude        — strings

import type { NewLiveIncident } from "@caltrans/db";
import {
  socrataFetch,
  socrataTimestamp,
  utcIsoToLANaive,
  extractLatLng,
  type SocrataDeps,
} from "./datasf-base";

export const SFPD_REPORTS_SOURCE = "sfpd_reports";
export const SFPD_REPORTS_RESOURCE = "wg3w-h783";

interface SFPDReportRow {
  row_id?: string;
  incident_id?: string;
  incident_number?: string;
  incident_datetime?: string;
  incident_category?: string;
  incident_subcategory?: string;
  incident_description?: string;
  resolution?: string;
  intersection?: string;
  analysis_neighborhood?: string;
  latitude?: string;
  longitude?: string;
  point?: { type?: string; coordinates?: [number, number] };
}

// Map common incident categories to severity.
function severityFor(category: string | undefined): "low" | "med" | "high" {
  const c = (category ?? "").toLowerCase();
  if (
    c.includes("homicide") ||
    c.includes("assault") ||
    c.includes("robbery") ||
    c.includes("sex offense") ||
    c.includes("rape") ||
    c.includes("kidnapping") ||
    c.includes("weapon")
  )
    return "high";
  if (
    c.includes("burglary") ||
    c.includes("motor vehicle theft") ||
    c.includes("arson") ||
    c.includes("stolen")
  )
    return "med";
  return "low";
}

export interface SFPDReportsFetchOptions {
  since?: string;
  limit?: number;
}

export async function fetchSFPDReports(
  deps: SocrataDeps,
  opts: SFPDReportsFetchOptions = {},
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const whereClauses: string[] = ["incident_datetime IS NOT NULL"];
  if (opts.since) {
    whereClauses.push(`incident_datetime > '${utcIsoToLANaive(opts.since)}'`);
  }
  const raw = await socrataFetch<SFPDReportRow>(
    SFPD_REPORTS_RESOURCE,
    {
      where: whereClauses.join(" AND "),
      order: "incident_datetime DESC",
      limit: opts.limit ?? 1000,
    },
    deps,
  );

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  for (const r of raw) {
    const sourceUid = r.row_id ?? r.incident_id ?? r.incident_number;
    if (!sourceUid) continue;
    const occurredAt = socrataTimestamp(r.incident_datetime);
    if (!occurredAt) continue;
    const pt = extractLatLng(r.point, r.latitude, r.longitude);
    if (!pt) continue;

    const title =
      r.incident_subcategory?.trim() ||
      r.incident_category?.trim() ||
      r.incident_description?.trim() ||
      "Incident report";
    const subtitleParts: string[] = [];
    if (r.incident_description && r.incident_description !== title)
      subtitleParts.push(r.incident_description);
    if (r.intersection) subtitleParts.push(r.intersection);

    rows.push({
      source: SFPD_REPORTS_SOURCE,
      sourceUid,
      kind: "police",
      title,
      subtitle: subtitleParts.join(" · ") || null,
      severity: severityFor(r.incident_category),
      priority: null,
      status: r.resolution ?? null,
      lat: pt.lat,
      lng: pt.lng,
      geoPrecision: "exact",
      neighborhood: r.analysis_neighborhood ?? null,
      address: r.intersection ?? null,
      occurredAt,
      raw: r as Record<string, unknown>,
    });

    if (!highWaterMark || occurredAt > highWaterMark) highWaterMark = occurredAt;
  }
  return { rows, highWaterMark };
}
