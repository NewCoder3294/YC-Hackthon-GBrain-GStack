import {
  cameras,
  cameraSurfaces,
  type Db,
  type NewCamera,
  type NewCameraSurface,
} from "@caltrans/db";
import { inArray, sql } from "drizzle-orm";
import {
  buildCaltransArcgisCctvUrl,
  parseCaltransArcgisResponse,
  type ParsedCameraInventory,
  type ParsedCameraSurface,
} from "./arcgis";
import { parseCalTransResponse } from "./caltrans";

export const CALTRANS_D4_URL =
  "https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json";

export interface SyncDeps {
  db: Db;
  fetch: typeof globalThis.fetch;
  arcgisUrl?: string;
  cwwp2Url?: string | null;
  url?: string;
}

export interface SyncResult {
  count: number;
  surfaces: number;
  enriched: number;
  enrichmentError?: string;
  syncedAt: Date;
}

export async function syncCameras(
  deps: SyncDeps,
): Promise<SyncResult> {
  const arcgisUrl = deps.arcgisUrl ?? deps.url ?? buildCaltransArcgisCctvUrl(4);
  const res = await deps.fetch(arcgisUrl, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`CalTrans ArcGIS fetch failed: ${res.status}`);
  }
  const arcgisJson = await res.json();
  assertNoArcgisError(arcgisJson);
  const parsed = parseCaltransArcgisResponse(arcgisJson);

  const enrichment = await fetchCwwp2Enrichment(deps);
  const records = mergeCwwp2Enrichment(parsed, enrichment.rows).filter(
    (record) => record.surfaces.length > 0 && record.camera.streamUrl.length > 0,
  );
  const rows = records.map((r) => r.camera);

  if (rows.length === 0) {
    return {
      count: 0,
      surfaces: 0,
      enriched: 0,
      ...(enrichment.error ? { enrichmentError: enrichment.error } : {}),
      syncedAt: new Date(),
    };
  }

  // Note: `isActive` is intentionally NOT updated on conflict. It is owned by
  // the liveness probe (`probeCameraLiveness`) after the row is first
  // inserted. CalTrans's `inService` flag is the seed value but is unreliable
  // (many streams it reports as in-service are 404 at the CDN). New rows
  // still get CalTrans's `is_active` value because `set` only runs on update.
  await deps.db
    .insert(cameras)
    .values(rows)
    .onConflictDoUpdate({
      target: cameras.caltransId,
      set: {
        district: sql`excluded.district`,
        route: sql`excluded.route`,
        direction: sql`excluded.direction`,
        mileMarker: sql`excluded.mile_marker`,
        description: sql`excluded.description`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        streamUrl: sql`excluded.stream_url`,
        streamType: sql`excluded.stream_type`,
        stillImageUrl: sql`excluded.still_image_url`,
        source: sql`excluded.source`,
        providerMetadata: sql`excluded.provider_metadata`,
        lastSyncedAt: sql`now()`,
      },
    });

  const ids = rows.map((r) => r.caltransId);
  const cameraIds = await deps.db
    .select({ id: cameras.id, caltransId: cameras.caltransId })
    .from(cameras)
    .where(inArray(cameras.caltransId, ids));
  const idByCaltrans = new Map(cameraIds.map((r) => [r.caltransId, r.id]));
  const surfaces: NewCameraSurface[] = [];
  for (const record of records) {
    const cameraId = idByCaltrans.get(record.camera.caltransId);
    if (!cameraId) continue;
    for (const surface of record.surfaces) {
      surfaces.push({ ...surface, cameraId });
    }
  }

  if (surfaces.length > 0) {
    await deps.db
      .insert(cameraSurfaces)
      .values(surfaces)
      .onConflictDoUpdate({
        target: [cameraSurfaces.provider, cameraSurfaces.providerKey],
        set: {
          cameraId: sql`excluded.camera_id`,
          kind: sql`excluded.kind`,
          url: sql`excluded.url`,
          priority: sql`excluded.priority`,
          isActive: true,
          metadata: sql`excluded.metadata`,
          lastSyncedAt: sql`now()`,
        },
      });
  }

  return {
    count: rows.length,
    surfaces: surfaces.length,
    enriched: enrichment.rows.length,
    ...(enrichment.error ? { enrichmentError: enrichment.error } : {}),
    syncedAt: new Date(),
  };
}

async function fetchCwwp2Enrichment(
  deps: SyncDeps,
): Promise<{ rows: NewCamera[]; error?: string }> {
  if (deps.cwwp2Url === null) return { rows: [] };
  const url = deps.cwwp2Url ?? CALTRANS_D4_URL;
  try {
    const res = await deps.fetch(url, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { rows: [], error: `CWWP2 fetch failed: ${res.status}` };
    return { rows: parseCalTransResponse(await res.json()) };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function mergeCwwp2Enrichment(
  primary: ParsedCameraInventory[],
  cwwp2Rows: NewCamera[],
): ParsedCameraInventory[] {
  const cwwp2ById = new Map(cwwp2Rows.map((r) => [r.caltransId, r]));
  return primary.map((record) => {
    const cwwp2 = cwwp2ById.get(record.camera.caltransId);
    if (!cwwp2) return record;

    const surfaces = [...record.surfaces];
    const hasStill = surfaces.some((s) => s.kind === "still");
    const hasHls = surfaces.some((s) => s.kind === "hls");
    if (!hasStill && cwwp2.stillImageUrl) {
      surfaces.push(cwwp2Surface(record.camera.caltransId, "still", cwwp2.stillImageUrl));
    }
    const hlsUrl = readHlsUrl(cwwp2.providerMetadata);
    if (!hasHls && hlsUrl) {
      surfaces.push(cwwp2Surface(record.camera.caltransId, "hls", hlsUrl));
    }

    const still = surfaces.find((s) => s.kind === "still")?.url ?? null;
    const hls = surfaces.find((s) => s.kind === "hls")?.url ?? null;
    return {
      camera: {
        ...record.camera,
        streamUrl: still ?? hls ?? record.camera.streamUrl,
        streamType: still ? "mjpeg" : "hls",
        stillImageUrl: still,
        providerMetadata: {
          ...(typeof record.camera.providerMetadata === "object" &&
          record.camera.providerMetadata
            ? record.camera.providerMetadata
            : {}),
          cwwp2: {
            seen: true,
            hlsUrl,
            stillImageUrl: cwwp2.stillImageUrl ?? null,
            inService: cwwp2.isActive,
          },
          hlsUrl: hls,
          hasHls: Boolean(hls),
          stillImageUrl: still,
        },
      },
      surfaces,
    };
  });
}

function cwwp2Surface(
  caltransId: string,
  kind: "still" | "hls",
  url: string,
): ParsedCameraSurface {
  return {
    kind,
    url,
    provider: "caltrans_cwwp2",
    providerKey: `${caltransId}:${kind}`,
    priority: kind === "still" ? 30 : 40,
    isActive: true,
    metadata: { enrichment: true },
  };
}

function readHlsUrl(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value =
    (metadata as { hlsUrl?: unknown; hls_url?: unknown }).hlsUrl ??
    (metadata as { hls_url?: unknown }).hls_url;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function assertNoArcgisError(input: unknown): void {
  if (!input || typeof input !== "object" || !("error" in input)) return;
  const error = (input as { error?: { message?: unknown; code?: unknown } }).error;
  const message = typeof error?.message === "string" ? error.message : "unknown";
  const code = error?.code == null ? "" : ` ${String(error.code)}`;
  throw new Error(`CalTrans ArcGIS query failed${code}: ${message}`);
}
