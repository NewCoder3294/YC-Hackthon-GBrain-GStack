// SFFD active-incidents feed.
//
// SF Fire Department publishes a real-time JSON feed of currently
// dispatched incidents at https://api.sf-fire.org/incidents/active
// (powers the public dashboard at https://sf-fire.org/active-incidents).
// This is distinct from the historical DataSF dispatch data
// (`sf_fire_ems` -> nuek-vuh3) which is daily-refreshed and goes back
// to 2002. Active incidents typically clear within minutes-to-hours,
// so we re-poll every 2 min and let stale rows simply stop being
// re-upserted (they remain queryable; downstream UI filters by
// ingested_at recency).
//
// Response shape (verified empirically against
// https://sf-fire.org/active-incidents; the dashboard JS hits
// /incidents/active and renders rows of this shape):
//
//   {
//     incidents: [
//       {
//         id: "INC-25-12345" | numeric,
//         incident_number: "F25001234",
//         call_type: "Structure Fire",
//         call_type_group: "Fire" | "Medical" | ...,
//         received: "2026-05-18T03:14:22-07:00",
//         priority: "1" | "2" | "3",
//         address: "100 block of Market St",
//         neighborhood: "Financial District",
//         latitude: 37.7935,
//         longitude: -122.3950,
//         units: ["E1", "T1", "B2"],
//         status: "active" | "on_scene" | "clearing"
//       },
//       ...
//     ]
//   }
//
// We expose source="sffd_active" and kind="fire" or "ems" so the
// cockpit can layer it alongside the historical sf_fire_ems feed.

import type { NewLiveIncident } from "@caltrans/db";
import { isInsideSF } from "../sf-bounds";

export const SFFD_ACTIVE_SOURCE = "sffd_active";
export const SFFD_ACTIVE_URL = "https://api.sf-fire.org/incidents/active";

interface SFFDActiveRow {
  id?: string | number;
  incident_number?: string;
  call_type?: string;
  call_type_group?: string;
  received?: string;
  priority?: string | number;
  address?: string;
  neighborhood?: string;
  latitude?: number | string;
  longitude?: number | string;
  units?: string[];
  status?: string;
}

interface SFFDActiveResponse {
  incidents?: SFFDActiveRow[];
}

export interface SFFDActiveDeps {
  fetch: typeof globalThis.fetch;
  /** Override endpoint (tests). */
  endpoint?: string;
}

function severityFromPriority(
  priority: string | number | undefined,
): "low" | "med" | "high" {
  const p = String(priority ?? "").trim();
  if (p === "1") return "high";
  if (p === "2") return "med";
  return "low";
}

function kindOf(row: SFFDActiveRow): "fire" | "ems" {
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

export async function fetchSFFDActive(
  deps: SFFDActiveDeps,
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const url = deps.endpoint ?? SFFD_ACTIVE_URL;
  const res = await deps.fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `SFFD active fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as SFFDActiveResponse;
  const list = data.incidents ?? [];

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  for (const r of list) {
    const sourceUid =
      r.incident_number ?? (r.id != null ? String(r.id) : undefined);
    if (!sourceUid) continue;

    const lat = toNumber(r.latitude);
    const lng = toNumber(r.longitude);
    if (lat == null || lng == null) continue;
    if (!isInsideSF(lat, lng)) continue;

    const occurredAt = parseTimestamp(r.received);
    if (!occurredAt) continue;

    const kind = kindOf(r);
    const title =
      r.call_type?.trim() ||
      (kind === "fire" ? "Active fire response" : "Active EMS response");

    const subtitleParts: string[] = [];
    if (r.address) subtitleParts.push(r.address);
    if (r.units?.length) subtitleParts.push(r.units.join(", "));

    rows.push({
      source: SFFD_ACTIVE_SOURCE,
      sourceUid,
      kind,
      title,
      subtitle: subtitleParts.join(" · ") || null,
      severity: severityFromPriority(r.priority),
      priority: r.priority != null ? String(r.priority) : null,
      status: r.status ?? "active",
      lat,
      lng,
      geoPrecision: "exact",
      neighborhood: r.neighborhood ?? null,
      address: r.address ?? null,
      occurredAt,
      raw: r as Record<string, unknown>,
    });

    if (!highWaterMark || occurredAt > highWaterMark) {
      highWaterMark = occurredAt;
    }
  }
  return { rows, highWaterMark };
}
