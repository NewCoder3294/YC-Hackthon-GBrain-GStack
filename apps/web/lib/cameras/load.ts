import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";
import { CAMERAS_CACHE_TAG } from "@/lib/cameras/cache-tags";
import type { CameraTileData } from "@/components/cameras/camera-tile";
export { CAMERAS_CACHE_TAG } from "@/lib/cameras/cache-tags";

const SECURITY_SOURCES: ReadonlyArray<string> = ["caltrans"] as const;
const DISPLAYABLE_PRODUCT_STATUSES = ["displayable", "unchecked"];
const DISPLAYABLE_VALIDATION_STATUSES = ["ok", "unchecked"];
const WALL_REVALIDATE_SECONDS = 60;

interface CameraRow {
  id: string;
  caltrans_id: string;
  route: string;
  direction: string | null;
  description: string;
  stream_url: string;
  stream_type: "hls" | "mjpeg" | "iframe" | string;
  still_image_url: string | null;
  source: string | null;
  provider_metadata: unknown;
  product_status?: "unchecked" | "displayable" | "degraded" | "hidden" | string;
  is_active?: boolean;
  lat?: number;
  lng?: number;
}

interface SurfaceHealthRow {
  reachability_status?: string | null;
  visual_status?: string | null;
}

interface SurfaceRow {
  id: string;
  camera_id: string;
  kind: "still" | "hls" | "iframe" | "rtsp" | string;
  url: string;
  priority: number | null;
  camera_surface_health?: SurfaceHealthRow | SurfaceHealthRow[] | null;
}

export async function fetchActiveCameras(): Promise<CameraTileData[]> {
  // Service role required: cameras has RLS limited to `authenticated`, and a
  // shared unstable_cache entry can't carry per-user JWTs. Service-role stays
  // server-side (this file is "server-only") and the data isn't sensitive.
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  const rows = await fetchCameraRowsForWall(sb);
  const surfaces = await loadSurfaceRows(sb, rows.map((row) => row.id));
  const byCamera = groupSurfacesByCamera(surfaces);
  return rows.flatMap((row) => {
    const tile = toCameraTile(row, byCamera.get(row.id) ?? []);
    return tile ? [tile] : [];
  });
}

async function fetchCameraRowsForWall(
  sb: { from: (table: string) => any },
): Promise<CameraRow[]> {
  const primary = await sb
    .from("cameras")
    .select(
      "id, caltrans_id, route, direction, description, stream_url, stream_type, still_image_url, source, provider_metadata, product_status",
    )
    .eq("is_active", true)
    .in("source", SECURITY_SOURCES as unknown as string[])
    .in("product_status", DISPLAYABLE_PRODUCT_STATUSES)
    .order("route", { ascending: true })
    .order("caltrans_id", { ascending: true });
  if (!primary.error) return (primary.data ?? []) as CameraRow[];
  if (!isMissingSurfaceModel(primary.error.message)) {
    throw new Error(primary.error.message);
  }

  const legacy = await sb
    .from("cameras")
    .select(
      "id, caltrans_id, route, direction, description, stream_url, stream_type, still_image_url, source, provider_metadata",
    )
    .eq("is_active", true)
    .in("source", SECURITY_SOURCES as unknown as string[])
    .in("validation_status", DISPLAYABLE_VALIDATION_STATUSES)
    .order("route", { ascending: true })
    .order("caltrans_id", { ascending: true });
  if (legacy.error) throw new Error(legacy.error.message);
  return ((legacy.data ?? []) as CameraRow[]).map((row) => ({
    ...row,
    product_status: "unchecked",
  }));
}

export const loadCameras = unstable_cache(
  fetchActiveCameras,
  ["wall:cameras:v13-surface-health"],
  { revalidate: WALL_REVALIDATE_SECONDS, tags: [CAMERAS_CACHE_TAG] },
);

function readHlsUrl(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value =
    (metadata as { hlsUrl?: unknown; hls_url?: unknown }).hlsUrl ??
    (metadata as { hls_url?: unknown }).hls_url;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function loadSurfaceRows(
  sb: { from: (table: string) => any },
  cameraIds: string[],
): Promise<SurfaceRow[]> {
  if (cameraIds.length === 0) return [];
  const { data, error } = await sb
    .from("camera_surfaces")
    .select(
      "id, camera_id, kind, url, priority, camera_surface_health(reachability_status, visual_status)",
    )
    .eq("is_active", true)
    .in("camera_id", cameraIds)
    .order("priority", { ascending: true });
  if (error) {
    if (isMissingSurfaceModel(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SurfaceRow[];
}

function isMissingSurfaceModel(message: string): boolean {
  return (
    message.includes("product_status") ||
    message.includes("camera_surfaces") ||
    message.includes("camera_surface_health")
  );
}

function groupSurfacesByCamera(
  surfaces: SurfaceRow[],
): Map<string, SurfaceRow[]> {
  const byCamera = new Map<string, SurfaceRow[]>();
  for (const surface of surfaces) {
    const group = byCamera.get(surface.camera_id) ?? [];
    group.push(surface);
    byCamera.set(surface.camera_id, group);
  }
  return byCamera;
}

function healthOf(surface: SurfaceRow): SurfaceHealthRow | null {
  const health = surface.camera_surface_health;
  return (Array.isArray(health) ? health[0] : health) ?? null;
}

function isHealthyStill(surface: SurfaceRow): boolean {
  const health = healthOf(surface);
  return (
    surface.kind === "still" &&
    health?.reachability_status === "ok" &&
    health.visual_status === "ok"
  );
}

function isUncheckedStill(surface: SurfaceRow): boolean {
  const health = healthOf(surface);
  return (
    surface.kind === "still" &&
    (!health ||
      health.reachability_status === "unchecked" ||
      health.visual_status === "unchecked")
  );
}

function sortSurfaces(surfaces: SurfaceRow[]): SurfaceRow[] {
  return [...surfaces].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
  );
}

function pickDisplayStill(c: CameraRow, surfaces: SurfaceRow[]): SurfaceRow | null {
  const sorted = sortSurfaces(surfaces);
  const healthy = sorted.find(isHealthyStill);
  if (healthy) return healthy;
  if (c.product_status === "unchecked") {
    return sorted.find(isUncheckedStill) ?? null;
  }
  return null;
}

function pickHlsUrl(c: CameraRow, surfaces: SurfaceRow[]): string | null {
  return (
    sortSurfaces(surfaces).find((surface) => surface.kind === "hls")?.url ??
    readHlsUrl(c.provider_metadata) ??
    (c.stream_type === "hls" ? c.stream_url : null)
  );
}

function proxiedCaltransStill(url: string | null): string | null {
  return url ? `/api/camera-frame?url=${encodeURIComponent(url)}` : null;
}

function toCameraTile(
  c: CameraRow,
  surfaces: SurfaceRow[],
): CameraTileData | null {
  // Windy webcams are embeds (player.day URLs), not HLS — render via iframe.
  const raw = c.source;
  const source: import("@/components/cameras/camera-tile").CameraSource =
    raw === "curated" ||
    raw === "sfmta" ||
    raw === "windy" ||
    raw === "contributor" ||
    raw === "demo"
      ? raw
      : "caltrans";
  const displayStill = pickDisplayStill(c, surfaces);
  const rawStillImageUrl =
    displayStill?.url ?? (c.product_status === "unchecked" ? c.still_image_url : null);
  const hlsUrl = pickHlsUrl(c, surfaces);

  if (source === "caltrans") {
    const proxiedStillImageUrl = proxiedCaltransStill(rawStillImageUrl);
    if (!proxiedStillImageUrl) return null;
    return {
      id: c.id,
      caltransId: c.caltrans_id,
      route: c.route,
      direction: c.direction,
      description: c.description,
      streamUrl: proxiedStillImageUrl,
      streamType: "mjpeg",
      stillImageUrl: proxiedStillImageUrl,
      hlsUrl,
      isActive: true,
      source,
    };
  }

  const streamType: "hls" | "mjpeg" | "iframe" =
    source === "windy" ? "iframe" : ((c.stream_type as "hls" | "mjpeg") ?? "hls");
  return {
    id: c.id,
    caltransId: c.caltrans_id,
    route: c.route,
    direction: c.direction,
    description: c.description,
    streamUrl: rawStillImageUrl || c.stream_url,
    streamType,
    stillImageUrl: rawStillImageUrl,
    hlsUrl,
    isActive: true,
    source,
  };
}

export interface CameraMapPin {
  id: string;
  caltransId: string;
  route: string;
  direction: string | null;
  description: string;
  streamUrl: string;
  streamType: "hls" | "mjpeg";
  stillImageUrl?: string | null;
  hlsUrl?: string | null;
  isActive: boolean;
  lat: number;
  lng: number;
}

const D4_BBOX = { minLat: 36.9, maxLat: 38.4, minLng: -123.2, maxLng: -121.5 };

export async function fetchCameraPins(): Promise<CameraMapPin[]> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  const rows = await fetchCameraRowsForPins(sb);
  const surfaces = await loadSurfaceRows(sb, rows.map((row) => row.id));
  const byCamera = groupSurfacesByCamera(surfaces);
  return rows.flatMap((c) => {
    const surfaceRows = byCamera.get(c.id) ?? [];
    const displayStill = pickDisplayStill(c, surfaceRows);
    const rawStillImageUrl =
      displayStill?.url ?? (c.product_status === "unchecked" ? c.still_image_url : null);
    const proxiedStillImageUrl = proxiedCaltransStill(rawStillImageUrl);
    if (!proxiedStillImageUrl) return [];
    const streamUrl = c.stream_url;
    return [
      {
        id: c.id,
        caltransId: c.caltrans_id,
        route: c.route,
        direction: c.direction,
        description: c.description,
        streamUrl: proxiedStillImageUrl,
        streamType: "mjpeg",
        stillImageUrl: proxiedStillImageUrl,
        hlsUrl:
          pickHlsUrl(c, surfaceRows) ??
          (c.stream_type === "hls" ? streamUrl : null),
        isActive: c.is_active ?? true,
        lat: c.lat as number,
        lng: c.lng as number,
      },
    ];
  });
}

async function fetchCameraRowsForPins(
  sb: { from: (table: string) => any },
): Promise<CameraRow[]> {
  const primary = await sb
    .from("cameras")
    .select(
      "id, caltrans_id, route, direction, description, stream_url, stream_type, still_image_url, provider_metadata, product_status, is_active, lat, lng",
    )
    .eq("is_active", true)
    .in("source", SECURITY_SOURCES as unknown as string[])
    .in("product_status", DISPLAYABLE_PRODUCT_STATUSES)
    .gte("lat", D4_BBOX.minLat)
    .lte("lat", D4_BBOX.maxLat)
    .gte("lng", D4_BBOX.minLng)
    .lte("lng", D4_BBOX.maxLng)
    .limit(2000)
    .order("caltrans_id", { ascending: true });
  if (!primary.error) return (primary.data ?? []) as CameraRow[];
  if (!isMissingSurfaceModel(primary.error.message)) {
    throw new Error(primary.error.message);
  }

  const legacy = await sb
    .from("cameras")
    .select(
      "id, caltrans_id, route, direction, description, stream_url, stream_type, still_image_url, provider_metadata, is_active, lat, lng",
    )
    .eq("is_active", true)
    .in("source", SECURITY_SOURCES as unknown as string[])
    .in("validation_status", DISPLAYABLE_VALIDATION_STATUSES)
    .gte("lat", D4_BBOX.minLat)
    .lte("lat", D4_BBOX.maxLat)
    .gte("lng", D4_BBOX.minLng)
    .lte("lng", D4_BBOX.maxLng)
    .limit(2000)
    .order("caltrans_id", { ascending: true });
  if (legacy.error) throw new Error(legacy.error.message);
  return ((legacy.data ?? []) as CameraRow[]).map((row) => ({
    ...row,
    product_status: "unchecked",
  }));
}

export const loadCameraPins = unstable_cache(
  fetchCameraPins,
  ["map:camera-pins:v10-surface-health"],
  { revalidate: 300, tags: [CAMERAS_CACHE_TAG] },
);
