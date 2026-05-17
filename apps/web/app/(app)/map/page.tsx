import { createClient } from "@/lib/supabase/server";
import { SFMap } from "@/components/map/sf-map";
import type { CameraTileData } from "@/components/cameras/camera-tile";
import type { NewsIncidentRow } from "@/components/map/news-panel";

export const dynamic = "force-dynamic";

// D4 (Bay Area) wide bbox — covers SF, Oakland, San Jose, Marin, San Mateo.
const D4_BBOX = { minLat: 36.9, maxLat: 38.4, minLng: -123.2, maxLng: -121.5 };

// SF city bbox for the news layer.
const SF_BBOX = { minLat: 37.70, maxLat: 37.84, minLng: -122.52, maxLng: -122.35 };

export default async function MapPage() {
  const supabase = await createClient();

  const [camerasRes, newsRes] = await Promise.all([
    supabase
      .from("cameras")
      .select("id, caltrans_id, route, direction, description, stream_url, stream_type, is_active, lat, lng")
      .eq("is_active", true)
      .gte("lat", D4_BBOX.minLat)
      .lte("lat", D4_BBOX.maxLat)
      .gte("lng", D4_BBOX.minLng)
      .lte("lng", D4_BBOX.maxLng)
      .limit(2000)
      .order("caltrans_id", { ascending: true }),
    supabase
      .from("news_incidents")
      .select("id, source, source_url, title, summary, crime_type, severity, neighborhood, address, lat, lng, published_at")
      .gte("lat", SF_BBOX.minLat)
      .lte("lat", SF_BBOX.maxLat)
      .gte("lng", SF_BBOX.minLng)
      .lte("lng", SF_BBOX.maxLng)
      .order("published_at", { ascending: false })
      .limit(500),
  ]);

  if (camerasRes.error) {
    return (
      <section className="p-6">
        <h1 className="font-mono text-sm uppercase tracking-widest">Map</h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Failed to load cameras: {camerasRes.error.message}
        </p>
      </section>
    );
  }

  const cameras = (camerasRes.data ?? []).map((c): CameraTileData & { lat: number; lng: number } => ({
    id: c.id,
    caltransId: c.caltrans_id,
    route: c.route,
    direction: c.direction,
    description: c.description,
    streamUrl: c.stream_url,
    streamType: c.stream_type as "hls" | "mjpeg",
    isActive: c.is_active,
    lat: c.lat,
    lng: c.lng,
  }));

  // News rows are optional — if the table or seed isn't present, the map
  // still renders with cameras (backwards compatible).
  const newsIncidents: NewsIncidentRow[] = (newsRes.data ?? []).map((n) => ({
    id: n.id as string,
    source: n.source as string,
    sourceUrl: n.source_url as string | null,
    title: n.title as string,
    summary: n.summary as string | null,
    crimeType: n.crime_type as string,
    severity: n.severity as "low" | "med" | "high",
    neighborhood: n.neighborhood as string | null,
    address: n.address as string | null,
    lat: n.lat as number,
    lng: n.lng as number,
    publishedAt: n.published_at as string,
  }));

  return <SFMap cameras={cameras} newsIncidents={newsIncidents} />;
}
