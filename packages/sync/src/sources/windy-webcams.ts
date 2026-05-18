// Windy Webcams API v3 — ingests SF-bbox public webcams into the cameras
// table with source='windy'. The Windy API returns:
//   - webcamId (stable)
//   - title, viewCount
//   - location { latitude, longitude, country, region, city }
//   - images.current.* (JPEG snapshots, expiring tokens on free tier)
//   - player.live / player.day / player.month / player.year (embed URLs,
//     stable)
//
// Free-tier snapshot URLs expire every 10 min. We store the player.day
// (stable embed URL) as stream_url and stash webcamId + the most recent
// image URL in provider_metadata. The wall tile renders Windy cams via
// iframe (player.day URL) — that's the simplest reliable surface that
// doesn't require an HLS-proxy build-out. A proxy that re-resolves fresh
// JPEGs from the Windy API is Phase 2.5.
//
// Auth: pass WINDY_WEBCAMS_API_KEY via the x-windy-api-key header. If
// the env var is unset, syncWindyCameras returns a no-op with a clear
// `disabled: true` flag so the cron route can degrade quietly.
//
// Docs: https://api.windy.com/webcams/api/v3/docs

import type { SupabaseClient } from "@supabase/supabase-js";

const WINDY_API_BASE = "https://api.windy.com/webcams/api/v3";

// SF + immediate surroundings. Lat/lng pair = SW corner, NE corner.
const SF_BBOX_SW = { lat: 37.7, lng: -122.55 };
const SF_BBOX_NE = { lat: 37.84, lng: -122.34 };

interface WindyImage {
  current?: { preview?: string | null; thumbnail?: string | null } | null;
}

interface WindyPlayer {
  live?: string | null;
  day?: string | null;
  month?: string | null;
}

interface WindyLocation {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

interface WindyWebcam {
  webcamId: number;
  title: string;
  viewCount?: number | null;
  status?: string | null;
  location?: WindyLocation | null;
  images?: WindyImage | null;
  player?: WindyPlayer | null;
}

interface WindyResponse {
  webcams?: WindyWebcam[];
  total?: number;
}

export interface SyncWindyResult {
  attempted: number;
  upserted: number;
  skipped: number;
  errors: { webcamId: number; message: string }[];
  disabled?: boolean;
}

export async function syncWindyCameras(
  admin: SupabaseClient,
  opts: { apiKey?: string | undefined; limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<SyncWindyResult> {
  const apiKey = opts.apiKey ?? process.env.WINDY_WEBCAMS_API_KEY;
  if (!apiKey) {
    return {
      attempted: 0,
      upserted: 0,
      skipped: 0,
      errors: [],
      disabled: true,
    };
  }
  const limit = opts.limit ?? 50;
  const fetchFn = opts.fetchImpl ?? fetch;

  const params = new URLSearchParams({
    nearby: `${(SF_BBOX_SW.lat + SF_BBOX_NE.lat) / 2},${(SF_BBOX_SW.lng + SF_BBOX_NE.lng) / 2},25`, // center + 25km radius
    limit: String(limit),
    include: "location,images,player",
  });

  const url = `${WINDY_API_BASE}/webcams?${params.toString()}`;
  const res = await fetchFn(url, {
    headers: { "x-windy-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`windy_api ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as WindyResponse;
  const webcams = body.webcams ?? [];

  const result: SyncWindyResult = {
    attempted: webcams.length,
    upserted: 0,
    skipped: 0,
    errors: [],
  };

  for (const cam of webcams) {
    if (!cam.location?.latitude || !cam.location?.longitude) {
      result.skipped += 1;
      continue;
    }
    const lat = cam.location.latitude;
    const lng = cam.location.longitude;
    // Defensive SF-bbox check — Windy's "nearby" can include neighbours.
    if (
      lat < SF_BBOX_SW.lat ||
      lat > SF_BBOX_NE.lat ||
      lng < SF_BBOX_SW.lng ||
      lng > SF_BBOX_NE.lng
    ) {
      result.skipped += 1;
      continue;
    }

    // Pick the most stable embeddable URL. player.day is a 24h-rolling
    // timelapse embed; player.live exists for paid tiers. Fall back to
    // the current snapshot URL — short-lived but better than nothing.
    const streamUrl =
      cam.player?.day ??
      cam.player?.live ??
      cam.images?.current?.preview ??
      cam.images?.current?.thumbnail ??
      "";
    if (!streamUrl) {
      result.skipped += 1;
      continue;
    }

    const slug = `windy-${cam.webcamId}`;
    const description =
      cam.title?.trim() || `Windy webcam #${cam.webcamId}`;
    const neighborhood =
      cam.location.city?.toLowerCase().replace(/\s+/g, "-") ?? "sf";

    const { error } = await admin.from("cameras").upsert(
      {
        caltrans_id: slug,
        district: 4,
        route: neighborhood,
        description,
        lat,
        lng,
        stream_url: streamUrl,
        stream_type: "hls", // best-effort label; tile component branches on source
        is_active: cam.status === "active" || cam.status == null,
        contributor_id: null,
        source: "windy",
        provider_metadata: {
          webcam_id: cam.webcamId,
          view_count: cam.viewCount ?? null,
          city: cam.location.city ?? null,
          player_day: cam.player?.day ?? null,
          player_live: cam.player?.live ?? null,
          image_preview: cam.images?.current?.preview ?? null,
        },
      },
      { onConflict: "caltrans_id" },
    );
    if (error) {
      result.errors.push({ webcamId: cam.webcamId, message: error.message });
    } else {
      result.upserted += 1;
    }
  }

  return result;
}
