// Curated catalog of public/municipal SF cameras.
//
// Each entry is a typed source-of-truth row that lands in `cameras` with
// source='curated' and contributor_id=null. The RPC enforcer
// short-circuits public_domain for these.
//
// Adding a camera is a typed edit here, then re-run the sync route.
// Stream URLs left to be filled in with vetted public HLS endpoints per
// camera. Until that's done, the entries point at Mux test streams so
// the wall renders and dev/QA can verify the wiring end-to-end.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CuratedCamera {
  /** Stable slug. Used as the `caltrans_id` upsert key — the column name
   *  predates this spec and is kept for backwards compatibility. */
  slug: string;
  description: string;
  neighborhood: string;
  lat: number;
  lng: number;
  /** Public HLS m3u8. Test stream placeholder until a real endpoint is
   *  attached; the slug remains stable through the swap. */
  streamUrl: string;
  attribution: string;
  attributionUrl?: string;
}

// Distribution: pin each major SF neighborhood the wall would advertise.
// Coordinates are approximate but geographically distinct so map pins
// don't overlap.
export const CURATED_SF_CAMERAS: CuratedCamera[] = [
  {
    slug: "curated-mission-16th-bart",
    description: "Mission & 16th BART plaza",
    neighborhood: "mission",
    lat: 37.7651,
    lng: -122.4194,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_0/url_0.m3u8",
    attribution: "EarthCam",
    attributionUrl: "https://www.earthcam.com/usa/california/sanfrancisco/",
  },
  {
    slug: "curated-mission-24th",
    description: "24th & Mission BART plaza",
    neighborhood: "mission",
    lat: 37.7522,
    lng: -122.4187,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_1/url_1.m3u8",
    attribution: "EarthCam",
  },
  {
    slug: "curated-embarcadero-mission",
    description: "Embarcadero & Mission",
    neighborhood: "embarcadero",
    lat: 37.7943,
    lng: -122.3946,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_2/url_2.m3u8",
    attribution: "Port of SF",
  },
  {
    slug: "curated-embarcadero-ferry",
    description: "Ferry Building plaza",
    neighborhood: "embarcadero",
    lat: 37.7956,
    lng: -122.3935,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_3/url_3.m3u8",
    attribution: "Port of SF",
  },
  {
    slug: "curated-twin-peaks",
    description: "Twin Peaks summit",
    neighborhood: "twin-peaks",
    lat: 37.7544,
    lng: -122.4477,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_4/url_4.m3u8",
    attribution: "EarthCam",
  },
  {
    slug: "curated-north-beach-columbus",
    description: "Columbus & Broadway",
    neighborhood: "north-beach",
    lat: 37.7977,
    lng: -122.408,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_5/url_5.m3u8",
    attribution: "SFGovTV",
  },
  {
    slug: "curated-castro-market",
    description: "Castro & Market",
    neighborhood: "castro",
    lat: 37.7619,
    lng: -122.435,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_6/url_6.m3u8",
    attribution: "EarthCam",
  },
  {
    slug: "curated-soma-5th-howard",
    description: "5th & Howard",
    neighborhood: "soma",
    lat: 37.7807,
    lng: -122.4067,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_7/url_7.m3u8",
    attribution: "Moscone Center",
  },
  {
    slug: "curated-tenderloin-hyde",
    description: "Hyde & Eddy (Tenderloin)",
    neighborhood: "tenderloin",
    lat: 37.7836,
    lng: -122.4159,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_8/url_8.m3u8",
    attribution: "SFGov",
  },
  {
    slug: "curated-fisherman-wharf",
    description: "Fisherman's Wharf",
    neighborhood: "fishermans-wharf",
    lat: 37.808,
    lng: -122.4177,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_9/url_9.m3u8",
    attribution: "EarthCam",
  },
  {
    slug: "curated-marina-green",
    description: "Marina Green",
    neighborhood: "marina",
    lat: 37.8059,
    lng: -122.4435,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_0/url_0.m3u8",
    attribution: "Presidio Trust",
  },
  {
    slug: "curated-haight-ashbury",
    description: "Haight & Ashbury",
    neighborhood: "haight",
    lat: 37.7699,
    lng: -122.4469,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_1/url_1.m3u8",
    attribution: "EarthCam",
  },
  {
    slug: "curated-richmond-clement",
    description: "Clement & 6th Ave",
    neighborhood: "richmond",
    lat: 37.7826,
    lng: -122.4641,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_2/url_2.m3u8",
    attribution: "SFGov",
  },
  {
    slug: "curated-sunset-irving",
    description: "Irving & 19th Ave",
    neighborhood: "sunset",
    lat: 37.7635,
    lng: -122.4773,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_3/url_3.m3u8",
    attribution: "SFGov",
  },
  {
    slug: "curated-bayview-3rd-palou",
    description: "3rd & Palou (Bayview)",
    neighborhood: "bayview",
    lat: 37.7349,
    lng: -122.391,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_4/url_4.m3u8",
    attribution: "SFGov",
  },
  {
    slug: "curated-civic-center-plaza",
    description: "Civic Center Plaza",
    neighborhood: "civic-center",
    lat: 37.7795,
    lng: -122.4194,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_5/url_5.m3u8",
    attribution: "SFGovTV",
  },
  {
    slug: "curated-union-square",
    description: "Union Square",
    neighborhood: "union-square",
    lat: 37.7879,
    lng: -122.4075,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_6/url_6.m3u8",
    attribution: "EarthCam",
  },
  {
    slug: "curated-financial-montgomery",
    description: "Montgomery & Market",
    neighborhood: "financial",
    lat: 37.789,
    lng: -122.402,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_7/url_7.m3u8",
    attribution: "SFGovTV",
  },
  {
    slug: "curated-soma-bryant",
    description: "Bryant & 8th",
    neighborhood: "soma",
    lat: 37.776,
    lng: -122.4042,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_8/url_8.m3u8",
    attribution: "SFGov",
  },
  {
    slug: "curated-japantown-buchanan",
    description: "Buchanan & Post (Japantown)",
    neighborhood: "japantown",
    lat: 37.7853,
    lng: -122.4297,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_9/url_9.m3u8",
    attribution: "EarthCam",
  },
];

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
