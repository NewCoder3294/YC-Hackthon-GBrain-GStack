import { createClient } from "@/lib/supabase/server";
import { loadCameraPins } from "@/lib/cameras/load";
import { SFMap } from "@/components/map/sf-map";
import type { NewsIncidentRow } from "@/components/map/news-panel";
import { CockpitSidebar } from "@/components/cockpit/cockpit-sidebar";
import { listLiveIncidents } from "@/app/(app)/(incidents)/live/data";
import { loadInstability } from "@/lib/cockpit/instability";
import { loadSFBrief } from "@/lib/cockpit/sf-brief";

export const revalidate = 60;
export const dynamic = "force-dynamic";

// SF city bbox for the news layer.
const SF_BBOX = { minLat: 37.7, maxLat: 37.84, minLng: -122.52, maxLng: -122.35 };

export default async function MapPage() {
  // Cameras come from the cached service-role loader so anon visitors get
  // the same Bay-Area-wide layer as logged-in operators. The news layer
  // is RLS-readable by anon already. Live incidents drive the Live Feed
  // panel in the cockpit sidebar.
  const supabase = await createClient();
  const [cameras, newsRes, liveIncidents, instability, sfBrief] = await Promise.all([
    loadCameraPins(),
    supabase
      .from("news_incidents")
      .select(
        "id, source, source_url, title, summary, crime_type, severity, neighborhood, address, lat, lng, published_at",
      )
      .gte("lat", SF_BBOX.minLat)
      .lte("lat", SF_BBOX.maxLat)
      .gte("lng", SF_BBOX.minLng)
      .lte("lng", SF_BBOX.maxLng)
      .order("published_at", { ascending: false })
      .limit(500),
    listLiveIncidents({ unacknowledgedOnly: true }),
    loadInstability(),
    loadSFBrief(),
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

  return (
    <div className="flex" style={{ height: "calc(100vh - 3rem)" }}>
      <div className="relative min-w-0 flex-1">
        <SFMap cameras={cameras} newsIncidents={newsIncidents} />
      </div>
      <CockpitSidebar
        liveIncidents={liveIncidents}
        instabilityRanking={instability.ranking}
        cityRisk={instability.city}
        aggregates={instability.aggregates}
        sfBrief={sfBrief}
      />
    </div>
  );
}
