import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";
import type { CameraTileData } from "@/components/cameras/camera-tile";

export const CAMERAS_CACHE_TAG = "cameras";

async function fetchActiveCameras(): Promise<CameraTileData[]> {
  // Service role required: cameras has RLS limited to `authenticated`, and a
  // shared unstable_cache entry can't carry per-user JWTs. Service-role stays
  // server-side (this file is "server-only") and the data isn't sensitive.
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb
    .from("cameras")
    .select("id, caltrans_id, route, direction, description, stream_url, stream_type")
    .eq("is_active", true)
    .order("route", { ascending: true })
    .order("caltrans_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    caltransId: c.caltrans_id as string,
    route: c.route as string,
    direction: c.direction as string | null,
    description: c.description as string,
    streamUrl: c.stream_url as string,
    streamType: c.stream_type as "hls" | "mjpeg",
    isActive: true,
  }));
}

export const loadCameras = unstable_cache(
  fetchActiveCameras,
  ["wall:cameras:v2"],
  { revalidate: 300, tags: [CAMERAS_CACHE_TAG] },
);
