import { createClient } from "@/lib/supabase/server";
import { CameraWall } from "@/components/cameras/camera-wall";
import type { CameraTileData } from "@/components/cameras/camera-tile";

export const dynamic = "force-dynamic";

export default async function WallPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cameras")
    .select("id, caltrans_id, route, direction, description, stream_url, stream_type, is_active")
    .eq("is_active", true)
    .order("route", { ascending: true })
    .order("caltrans_id", { ascending: true });

  if (error) {
    return (
      <section className="p-6">
        <h1 className="font-mono text-sm uppercase tracking-widest">Live Wall</h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Failed to load cameras: {error.message}
        </p>
      </section>
    );
  }

  const cameras: CameraTileData[] = (data ?? []).map((c) => ({
    id: c.id,
    caltransId: c.caltrans_id,
    route: c.route,
    direction: c.direction,
    description: c.description,
    streamUrl: c.stream_url,
    streamType: c.stream_type as "hls" | "mjpeg",
    isActive: c.is_active,
  }));

  return <CameraWall cameras={cameras} />;
}
