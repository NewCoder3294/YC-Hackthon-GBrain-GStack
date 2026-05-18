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
    .select(
      "id, caltrans_id, route, direction, description, stream_url, stream_type, source",
    )
    .eq("is_active", true)
    .order("route", { ascending: true })
    .order("caltrans_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => {
    // Windy webcams are embeds (player.day URLs), not HLS — render via iframe.
    const source = (c as { source?: string | null }).source ?? "caltrans";
    const streamType: "hls" | "mjpeg" | "iframe" =
      source === "windy"
        ? "iframe"
        : ((c.stream_type as "hls" | "mjpeg") ?? "hls");
    return {
      id: c.id as string,
      caltransId: c.caltrans_id as string,
      route: c.route as string,
      direction: c.direction as string | null,
      description: c.description as string,
      streamUrl: c.stream_url as string,
      streamType,
      isActive: true,
    };
  });
}

export const loadCameras = unstable_cache(
  fetchActiveCameras,
  ["wall:cameras:v2"],
  { revalidate: 300, tags: [CAMERAS_CACHE_TAG] },
);

export interface CameraMapPin {
  id: string;
  caltransId: string;
  route: string;
  direction: string | null;
  description: string;
  streamUrl: string;
  streamType: "hls" | "mjpeg";
  isActive: boolean;
  lat: number;
  lng: number;
}

const D4_BBOX = { minLat: 36.9, maxLat: 38.4, minLng: -123.2, maxLng: -121.5 };

async function fetchCameraPins(): Promise<CameraMapPin[]> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb
    .from("cameras")
    .select("id, caltrans_id, route, direction, description, stream_url, stream_type, is_active, lat, lng")
    .eq("is_active", true)
    .gte("lat", D4_BBOX.minLat)
    .lte("lat", D4_BBOX.maxLat)
    .gte("lng", D4_BBOX.minLng)
    .lte("lng", D4_BBOX.maxLng)
    .limit(2000)
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
    isActive: c.is_active as boolean,
    lat: c.lat as number,
    lng: c.lng as number,
  }));
}

export const loadCameraPins = unstable_cache(
  fetchCameraPins,
  ["map:camera-pins:v1"],
  { revalidate: 300, tags: [CAMERAS_CACHE_TAG] },
);
