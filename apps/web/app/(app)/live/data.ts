import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  type LiveIncident,
  type LiveIncidentSource,
  type LiveIncidentKind,
  type LiveIncidentSeverity,
  type LiveIncidentGeoPrecision,
} from "@/lib/live-incidents";

export interface LiveFilters {
  source?: LiveIncidentSource;
  severity?: LiveIncidentSeverity;
  neighborhood?: string;
  q?: string;
  /** ISO timestamp; rows with occurred_at >= since are returned. */
  since?: string;
  /** Hide acknowledged rows (default true on dispatcher view). */
  unacknowledgedOnly?: boolean;
}

interface LiveIncidentDbRow {
  id: string;
  source: string;
  source_uid: string;
  kind: string;
  title: string;
  subtitle: string | null;
  severity: string;
  priority: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  geo_precision: string;
  neighborhood: string | null;
  address: string | null;
  occurred_at: string;
  acknowledged_at: string | null;
}

function toRow(r: LiveIncidentDbRow): LiveIncident {
  return {
    id: r.id,
    source: r.source as LiveIncidentSource,
    sourceUid: r.source_uid,
    kind: r.kind as LiveIncidentKind,
    title: r.title,
    subtitle: r.subtitle,
    severity: (r.severity as LiveIncidentSeverity) ?? "low",
    priority: r.priority,
    status: r.status,
    lat: r.lat ?? 0,
    lng: r.lng ?? 0,
    geoPrecision: (r.geo_precision as LiveIncidentGeoPrecision) ?? "unknown",
    neighborhood: r.neighborhood,
    address: r.address,
    occurredAt: r.occurred_at,
    acknowledgedAt: r.acknowledged_at,
  };
}

export async function listLiveIncidents(
  filters: LiveFilters,
): Promise<LiveIncident[]> {
  const supabase = await createClient();
  let query = supabase
    .from("live_incidents")
    .select(
      "id, source, source_uid, kind, title, subtitle, severity, priority, status, lat, lng, geo_precision, neighborhood, address, occurred_at, acknowledged_at",
    )
    .order("occurred_at", { ascending: false })
    .limit(500);

  if (filters.source) query = query.eq("source", filters.source);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.neighborhood)
    query = query.ilike("neighborhood", `%${filters.neighborhood}%`);
  if (filters.since) query = query.gte("occurred_at", filters.since);
  if (filters.q) {
    const term = `%${filters.q}%`;
    query = query.or(
      `title.ilike.${term},subtitle.ilike.${term},address.ilike.${term}`,
    );
  }
  if (filters.unacknowledgedOnly) query = query.is("acknowledged_at", null);

  const { data, error } = await query;
  if (error) throw new Error(`listLiveIncidents: ${error.message}`);

  return (data ?? []).map((r) => toRow(r as LiveIncidentDbRow));
}

export async function getLiveIncident(id: string): Promise<{
  incident: LiveIncident;
  raw: Record<string, unknown> | null;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("live_incidents")
    .select(
      "id, source, source_uid, kind, title, subtitle, severity, priority, status, lat, lng, geo_precision, neighborhood, address, occurred_at, acknowledged_at, raw",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getLiveIncident: ${error.message}`);
  if (!data) return null;
  const row = data as LiveIncidentDbRow & { raw: Record<string, unknown> | null };
  return { incident: toRow(row), raw: row.raw };
}

export async function listDistinctNeighborhoods(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("live_incidents")
    .select("neighborhood")
    .not("neighborhood", "is", null)
    .order("neighborhood");
  if (error) return [];
  const set = new Set<string>();
  for (const row of data ?? []) {
    const n = (row as { neighborhood: string | null }).neighborhood;
    if (n) set.add(n);
  }
  return [...set].sort();
}
