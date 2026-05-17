import { createClient } from "@/lib/supabase/server";
import { loadCameraPins } from "@/lib/cameras/load";
import { SFMap } from "@/components/map/sf-map";
import type { NewsIncidentRow } from "@/components/map/news-panel";

export const revalidate = 60;

// SF city bbox for the news layer.
const SF_BBOX = { minLat: 37.70, maxLat: 37.84, minLng: -122.52, maxLng: -122.35 };

export default async function MapPage() {
  // Cameras come from the cached service-role loader so anon visitors get
  // the same Bay-Area-wide layer as logged-in operators. The news layer
  // is RLS-readable by anon already.
  const supabase = await createClient();
  const [cameras, newsRes] = await Promise.all([
    loadCameraPins(),
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
