import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { CAMERAS_CACHE_TAG } from "@/lib/cameras/cache-tags";
import { validateCamera } from "@/lib/cameras/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const VALIDATION_CONCURRENCY = 6;
const STALE_AFTER_MS = 6 * 60 * 60_000; // 6 hours

interface CameraRow {
  id: string;
  source: string;
}

interface SurfaceRow {
  id: string;
  camera_id: string;
  kind: "still" | "hls" | "iframe" | "rtsp" | string;
  url: string;
  priority: number | null;
  cameras?: CameraRow | CameraRow[] | null;
}

interface HealthRow {
  reachability_status?: string | null;
  visual_status?: string | null;
}

interface SurfaceWithHealth {
  id: string;
  camera_id: string;
  kind: string;
  url: string;
  priority: number | null;
  camera_surface_health?: HealthRow | HealthRow[] | null;
}

async function runValidation(request: NextRequest) {
  // Read directly from process.env (not via @/lib/env) so the route stays
  // testable without pulling the full env schema into the test environment.
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const secret = process.env.WATCHDOG_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();

  // Validate delivery surfaces, not camera rows. A camera can have a dead HLS
  // surface and a healthy still surface; product status is derived afterward.
  const { data: rows } = await supabase
    .from("camera_surfaces")
    .select("id, camera_id, kind, url, priority, cameras!inner(id, source)")
    .eq("is_active", true)
    .order("last_synced_at", { ascending: true })
    .limit(BATCH_SIZE);

  let ok = 0;
  let degraded = 0;
  let failed = 0;
  const affectedCameraIds = new Set<string>();
  const healthRows: Array<{
    surface_id: string;
    reachability_status: "ok" | "failed";
    visual_status: "ok" | "failed" | "not_applicable";
    last_checked_at: string;
    error: string | null;
    sample_metadata: Record<string, unknown>;
  }> = [];
  const surfaceRows = (rows ?? []) as SurfaceRow[];
  await mapWithConcurrency(surfaceRows, VALIDATION_CONCURRENCY, async (row) => {
    const source = readCameraSource(row.cameras);
    const r = await validateCamera(
      {
        streamUrl: row.url,
        streamType: streamTypeForSurface(row.kind),
        source,
        stillImageUrl: row.kind === "still" ? row.url : null,
        hlsUrl: row.kind === "hls" ? row.url : null,
      },
      fetch,
    );
    affectedCameraIds.add(row.camera_id);
    healthRows.push({
      surface_id: row.id,
      reachability_status: reachabilityFor(row.kind, r.error, r.status),
      visual_status: visualFor(row.kind, r.status),
      last_checked_at: new Date().toISOString(),
      error: r.error,
      sample_metadata: { status: r.status },
    });
    if (r.status === "ok") ok++;
    else if (r.status === "degraded") degraded++;
    else failed++;
  });

  if (healthRows.length > 0) {
    const { error: healthError } = await supabase
      .from("camera_surface_health")
      .upsert(healthRows, { onConflict: "surface_id" });
    if (healthError) {
      throw new Error(healthError.message);
    }
    await updateAffectedCameraProducts(supabase, Array.from(affectedCameraIds));
  }

  // Mark surfaces that haven't been re-validated in 6h as stale.
  const sixHoursAgo = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { count: staleCount, error: staleError } = await supabase
    .from("camera_surface_health")
    .update(
      {
        reachability_status: "stale",
        visual_status: "stale",
      },
      { count: "exact" },
    )
    .in("reachability_status", ["ok", "failed"])
    .lt("last_checked_at", sixHoursAgo);
  if (staleError) {
    throw new Error(staleError.message);
  }

  if (ok + degraded + failed > 0 || (staleCount ?? 0) > 0) {
    revalidateTag(CAMERAS_CACHE_TAG);
  }

  return NextResponse.json({
    processed: ok + degraded + failed,
    ok,
    degraded,
    failed,
    staled: staleCount ?? 0,
  });
}

export async function GET(request: NextRequest) {
  return runValidation(request);
}

export async function POST(request: NextRequest) {
  return runValidation(request);
}

function readCameraSource(row: CameraRow | CameraRow[] | null | undefined): string {
  const camera = Array.isArray(row) ? row[0] : row;
  return camera?.source ?? "caltrans";
}

function streamTypeForSurface(kind: string): "hls" | "mjpeg" | "iframe" {
  if (kind === "hls") return "hls";
  if (kind === "iframe") return "iframe";
  return "mjpeg";
}

function isReachabilityError(error: string | null): boolean {
  if (!error) return false;
  return (
    error.includes("http_") ||
    error.includes("fetch") ||
    error.includes("timeout") ||
    error.includes("network") ||
    error.includes("missing_url")
  );
}

function reachabilityFor(
  kind: string,
  error: string | null,
  status: "ok" | "degraded" | "failed",
): "ok" | "failed" {
  if (status === "ok" || status === "degraded") return "ok";
  if (kind === "still" && !isReachabilityError(error)) return "ok";
  return "failed";
}

function visualFor(
  kind: string,
  status: "ok" | "degraded" | "failed",
): "ok" | "failed" | "not_applicable" {
  if (kind !== "still") return "not_applicable";
  return status === "ok" ? "ok" : "failed";
}

function readHealth(row: SurfaceWithHealth): HealthRow | null {
  const health = row.camera_surface_health;
  return (Array.isArray(health) ? health[0] : health) ?? null;
}

function isHealthyStill(row: SurfaceWithHealth): boolean {
  const health = readHealth(row);
  return (
    row.kind === "still" &&
    health?.reachability_status === "ok" &&
    health.visual_status === "ok"
  );
}

function isHealthyHls(row: SurfaceWithHealth): boolean {
  const health = readHealth(row);
  return row.kind === "hls" && health?.reachability_status === "ok";
}

async function updateAffectedCameraProducts(
  supabase: ReturnType<typeof adminClient>,
  cameraIds: string[],
): Promise<void> {
  if (cameraIds.length === 0) return;
  const { data, error } = await supabase
    .from("camera_surfaces")
    .select(
      "id, camera_id, kind, url, priority, camera_surface_health(reachability_status, visual_status)",
    )
    .eq("is_active", true)
    .in("camera_id", cameraIds);
  if (error) throw new Error(error.message);

  const byCamera = new Map<string, SurfaceWithHealth[]>();
  for (const surface of (data ?? []) as SurfaceWithHealth[]) {
    const group = byCamera.get(surface.camera_id) ?? [];
    group.push(surface);
    byCamera.set(surface.camera_id, group);
  }

  for (const cameraId of cameraIds) {
    const surfaces = (byCamera.get(cameraId) ?? []).sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
    );
    const still = surfaces.find(isHealthyStill);
    const hls = surfaces.find(isHealthyHls);
    const productStatus = still ? "displayable" : hls ? "degraded" : "hidden";
    const validationStatus = still ? "ok" : hls ? "degraded" : "failed";
    const update: Record<string, unknown> = {
      product_status: productStatus,
      validation_status: validationStatus,
      last_validated_at: new Date().toISOString(),
      validation_error: productStatus === "hidden" ? "no_healthy_surface" : null,
      is_active: productStatus !== "hidden",
    };
    if (still) {
      update.stream_url = still.url;
      update.stream_type = "mjpeg";
      update.still_image_url = still.url;
    } else if (hls) {
      update.stream_url = hls.url;
      update.stream_type = "hls";
    }

    const { error: updateError } = await supabase
      .from("cameras")
      .update(update)
      .eq("id", cameraId);
    if (updateError) throw new Error(updateError.message);
  }
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item) await fn(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}
