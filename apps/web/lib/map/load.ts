import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MapFilter } from "./filter";

export interface FilteredIncidentPin {
  id: string;
  source: string;
  title: string;
  severity: "low" | "med" | "high";
  neighborhood: string | null;
  lat: number;
  lng: number;
  occurredAt: string;
}

// Default window when the user hasn't specified `since` — last 24h.
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

const SF_BBOX = { minLat: 37.7, maxLat: 37.84, minLng: -122.52, maxLng: -122.35 };

/**
 * Load geocoded live_incidents matching `filter` for rendering as map
 * pins. Always filters to the SF bbox so out-of-region rows don't bleed
 * into the view.
 */
export async function loadFilteredIncidents(
  filter: MapFilter,
): Promise<FilteredIncidentPin[]> {
  const supabase = await createClient();
  const since =
    filter.since ?? new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString();

  let query = supabase
    .from("live_incidents")
    .select("id, source, title, severity, neighborhood, lat, lng, occurred_at")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .gte("lat", SF_BBOX.minLat)
    .lte("lat", SF_BBOX.maxLat)
    .gte("lng", SF_BBOX.minLng)
    .lte("lng", SF_BBOX.maxLng)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(750);

  if (filter.until) query = query.lte("occurred_at", filter.until);
  if (filter.sources?.length) query = query.in("source", filter.sources);
  if (filter.severities?.length) query = query.in("severity", filter.severities);
  if (filter.neighborhoods?.length)
    query = query.in("neighborhood", filter.neighborhoods);
  if (filter.titleContains?.length) {
    // Postgrest doesn't take ILIKE-ANY directly; chain `or` with each term.
    const ors = filter.titleContains
      .map((t) => `title.ilike.%${t.replace(/[%,]/g, "")}%`)
      .join(",");
    query = query.or(ors);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    source: r.source as string,
    title: r.title as string,
    severity:
      (r.severity as string) === "high"
        ? "high"
        : (r.severity as string) === "med"
          ? "med"
          : "low",
    neighborhood: r.neighborhood as string | null,
    lat: r.lat as number,
    lng: r.lng as number,
    occurredAt: r.occurred_at as string,
  }));
}
