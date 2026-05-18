// Curated catalog of public/municipal SF cameras.
//
// Each entry is a typed source-of-truth row that lands in `cameras` with
// source='curated' and contributor_id=null. The RPC enforcer
// short-circuits public_domain for these.
//
// Adding a camera is a typed edit here, then re-run the sync route.
//
// NOTE: this list is intentionally empty. Earlier iterations seeded it
// with Mux test streams as visual placeholders, but those render generic
// HLS sample content (soccer footage, b-roll, art clips) underneath SF
// neighborhood labels — dishonest and confusing. The Streets group will
// auto-hide while empty (see availableGroups in camera-wall.tsx).
//
// Real street-level coverage lands here via one of:
//   - Windy public webcams ingest (packages/sync/src/sources/windy-webcams.ts)
//   - SFMTA / SFGov open camera feeds when published
//   - Vetted homeowner contributions surfaced via the contributor flow
//
// Add a real entry by appending it to CURATED_SF_CAMERAS and running
// `GET /api/cron/sync-curated-cameras` to upsert.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CuratedCamera {
  /** Stable slug. Used as the `caltrans_id` upsert key — the column name
   *  predates this spec and is kept for backwards compatibility. */
  slug: string;
  description: string;
  neighborhood: string;
  lat: number;
  lng: number;
  /** Public HLS m3u8 from a real source. No test streams. */
  streamUrl: string;
  attribution: string;
  attributionUrl?: string;
}

export const CURATED_SF_CAMERAS: CuratedCamera[] = [];

export interface SyncCuratedResult {
  attempted: number;
  upserted: number;
  errors: { slug: string; message: string }[];
}

export async function syncCuratedCameras(
  admin: SupabaseClient,
): Promise<SyncCuratedResult> {
  const result: SyncCuratedResult = {
    attempted: CURATED_SF_CAMERAS.length,
    upserted: 0,
    errors: [],
  };

  for (const cam of CURATED_SF_CAMERAS) {
    const { error } = await admin.from("cameras").upsert(
      {
        caltrans_id: cam.slug,
        district: 4,
        route: cam.neighborhood,
        description: cam.description,
        lat: cam.lat,
        lng: cam.lng,
        stream_url: cam.streamUrl,
        stream_type: "hls",
        is_active: true,
        contributor_id: null,
        source: "curated",
      },
      { onConflict: "caltrans_id" },
    );
    if (error) {
      result.errors.push({ slug: cam.slug, message: error.message });
    } else {
      result.upserted += 1;
    }
  }

  return result;
}
