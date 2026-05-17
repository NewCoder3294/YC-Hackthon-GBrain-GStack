import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  type LiveIncident,
  type LiveIncidentGeoPrecision,
  type LiveIncidentKind,
  type LiveIncidentSeverity,
  type LiveIncidentSource,
} from "@/lib/live-incidents";

export const runtime = "nodejs";
// No revalidate cache — this endpoint backs the live operator feed.
// Stale reads here surface as "no events" on the dashboard.
export const dynamic = "force-dynamic";

const COLUMNS =
  "id, source, source_uid, kind, title, subtitle, severity, priority, status, lat, lng, geo_precision, neighborhood, address, occurred_at, acknowledged_at";

interface DbRow {
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

function shape(r: DbRow): LiveIncident {
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

// Returns the most-recent live SF incidents for client polling. Reads
// via the service client so RLS on `live_incidents` (which denies anon
// reads) doesn't blank the operator feed.
export async function GET() {
  try {
    const supabase = createServiceClient();
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("live_incidents")
      .select(COLUMNS)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json(
        { error: error.message, incidents: [] },
        { status: 500 },
      );
    }
    const rows = ((data ?? []) as DbRow[]).map(shape);
    // Drop rows without coordinates — feed UI needs lat/lng for the map pin.
    const usable = rows.filter(
      (r) =>
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng) &&
        (r.lat !== 0 || r.lng !== 0),
    );
    return NextResponse.json({
      incidents: usable,
      count: usable.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed", incidents: [] },
      { status: 500 },
    );
  }
}
