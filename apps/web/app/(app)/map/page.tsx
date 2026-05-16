import { createClient } from "@/lib/supabase/server";
import { SFMap } from "@/components/map/sf-map";
import type { CameraTileData } from "@/components/cameras/camera-tile";

export const dynamic = "force-dynamic";

// D4 (Bay Area) wide bbox — covers SF, Oakland, San Jose, Marin, San Mateo.
const D4_BBOX = { minLat: 36.9, maxLat: 38.4, minLng: -123.2, maxLng: -121.5 };

export default async function MapPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cameras")
    .select("id, caltrans_id, route, direction, description, stream_url, stream_type, is_active, lat, lng")
    .eq("is_active", true)
    .gte("lat", D4_BBOX.minLat)
    .lte("lat", D4_BBOX.maxLat)
    .gte("lng", D4_BBOX.minLng)
    .lte("lng", D4_BBOX.maxLng)
    .limit(2000)
    .order("caltrans_id", { ascending: true });

  if (error) {
    return (
      <section className="p-6">
        <h1 className="font-mono text-sm uppercase tracking-widest">Map</h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Failed to load cameras: {error.message}
        </p>
      </section>
    );
  }

  const cameras = (data ?? []).map((c): CameraTileData & { lat: number; lng: number } => ({
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

  return <SFMap cameras={cameras} />;
}
