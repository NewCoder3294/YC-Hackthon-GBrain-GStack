// SF Fire Department and EMS Dispatched Calls — DataSF resource `nuek-vuh3`.
// Daily refresh; we poll every 6 hours.
//
// Schema (key fields):
//   incident_number          — unique
//   call_number              — alt id
//   call_type                — e.g., "Medical Incident", "Structure Fire"
//   priority                 — numeric 1–3 in SFFD scheme (1 = highest)
//   received_dttm / entry_dttm / dispatch_dttm — timestamps
//   point                    — Point geometry
//   latitude / longitude     — fallback strings
//   neighborhoods_analysis_boundaries — text neighborhood
//   address                  — block-level

import type { NewLiveIncident } from "@caltrans/db";
import {
  socrataFetch,
  socrataTimestamp,
  utcIsoToLANaive,
  extractLatLng,
  type SocrataDeps,
  type SocrataPoint,
} from "./datasf-base";

export const FIRE_EMS_SOURCE = "sf_fire_ems";
export const FIRE_EMS_RESOURCE = "nuek-vuh3";

interface FireEMSRow {
  incident_number?: string;
  call_number?: string;
  call_type?: string;
  call_type_group?: string;
  priority?: string;
  received_dttm?: string;
  entry_dttm?: string;
  dispatch_dttm?: string;
  point?: SocrataPoint;
  latitude?: string;
  longitude?: string;
  neighborhoods_analysis_boundaries?: string;
  address?: string;
  battalion?: string;
}

// SFFD priorities are numeric: 1 = highest. Map to our enum.
function severityFromPriority(priority: string | undefined): "low" | "med" | "high" {
  const p = (priority ?? "").trim();
  if (p === "1") return "high";
  if (p === "2") return "med";
  return "low";
}

// Distinguish fire vs ems by the call_type_group when available; fall back
// to substring match on call_type.
function kindOf(row: FireEMSRow): "fire" | "ems" {
  const group = (row.call_type_group ?? "").toLowerCase();
  if (group.includes("fire") || group.includes("alarm") || group.includes("hazmat"))
    return "fire";
  if (group.includes("medical") || group.includes("ems")) return "ems";
  const t = (row.call_type ?? "").toLowerCase();
  if (
    t.includes("fire") ||
    t.includes("alarm") ||
    t.includes("smoke") ||
    t.includes("explosion") ||
    t.includes("hazmat")
  )
    return "fire";
  return "ems";
}

export interface FireEMSFetchOptions {
  since?: string;
  limit?: number;
}

export async function fetchFireEMS(
  deps: SocrataDeps,
  opts: FireEMSFetchOptions = {},
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const whereClauses: string[] = ["received_dttm IS NOT NULL"];
  if (opts.since) {
    whereClauses.push(`received_dttm > '${utcIsoToLANaive(opts.since)}'`);
  }
  const raw = await socrataFetch<FireEMSRow>(
    FIRE_EMS_RESOURCE,
    {
      where: whereClauses.join(" AND "),
      order: "received_dttm DESC",
      limit: opts.limit ?? 1000,
    },
    deps,
  );

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  for (const r of raw) {
    const sourceUid = r.incident_number ?? r.call_number;
    if (!sourceUid) continue;
    const occurredAt = socrataTimestamp(r.received_dttm ?? r.entry_dttm ?? r.dispatch_dttm);
    if (!occurredAt) continue;

    const pt = extractLatLng(r.point, r.latitude, r.longitude);
    if (!pt) continue;

    const kind = kindOf(r);
    const title = r.call_type?.trim() || (kind === "fire" ? "Fire response" : "EMS response");
    const subtitleParts: string[] = [];
    if (r.address) subtitleParts.push(r.address);
    if (r.neighborhoods_analysis_boundaries)
      subtitleParts.push(r.neighborhoods_analysis_boundaries);
    if (r.battalion) subtitleParts.push(`Bn ${r.battalion}`);

    rows.push({
      source: FIRE_EMS_SOURCE,
      sourceUid,
      kind,
      title,
      subtitle: subtitleParts.join(" · ") || null,
      severity: severityFromPriority(r.priority),
      priority: r.priority ?? null,
      status: null,
      lat: pt.lat,
      lng: pt.lng,
      geoPrecision: "exact",
      neighborhood: r.neighborhoods_analysis_boundaries ?? null,
      address: r.address ?? null,
      occurredAt,
      raw: r as Record<string, unknown>,
    });

    if (!highWaterMark || occurredAt > highWaterMark) highWaterMark = occurredAt;
  }
  return { rows, highWaterMark };
}
