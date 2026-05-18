// ADS-B aircraft positions via OpenSky Network.
//
// Endpoint: GET https://opensky-network.org/api/states/all
//   ?lamin=..&lomin=..&lamax=..&lomax=..
// Auth: keyless for limited use; HTTP Basic auth for higher rate limits.
// Free tier limits aggressively, so the cron polls only every 5 min.
//
// Response shape per the OpenSky docs:
//   { time: number, states: Array<Tuple> | null }
// Each Tuple is a fixed-position array indexed by:
//   0  icao24 (string, hex)
//   1  callsign (string, possibly trailing whitespace) — used for source_uid
//   2  origin_country (string)
//   3  time_position (unix seconds)
//   4  last_contact (unix seconds)
//   5  longitude (number | null)
//   6  latitude (number | null)
//   7  baro_altitude (m)
//   8  on_ground (bool)
//   9  velocity (m/s)
//   10 true_track (deg)
//   11 vertical_rate (m/s)
//   12 sensors (number[])
//   13 geo_altitude (m | null)
//   14 squawk (string | null)
//   15 spi (bool)
//   16 position_source (number)
//   17 category (number | null) — only on /states/all when extended=1
//
// We surface two kinds of "interesting" aircraft:
//   - helicopters (heuristic: category === 7, OR altitude < 600m + velocity < 60 m/s + airborne)
//   - low-altitude loiterers (altitude < 1200m, velocity < 100 m/s,
//     airborne — anything circling near downtown)
// Everything else is dropped to keep the panel signal-rich.

import type { NewEnvSignal } from "@caltrans/db";
import { SF_CITY_HALL } from "../sf-bounds";

export const ADSB_SOURCE = "adsb_opensky";

const OPENSKY_ENDPOINT = "https://opensky-network.org/api/states/all";

// 25km radius around SF — matches the brief.
const SEARCH_RADIUS_KM = 25;

// Rough degree-per-km at SF's latitude (cosine correction baked in).
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG = 111.32 * Math.cos((SF_CITY_HALL.lat * Math.PI) / 180);

const BBOX = {
  minLat: SF_CITY_HALL.lat - SEARCH_RADIUS_KM / KM_PER_DEG_LAT,
  maxLat: SF_CITY_HALL.lat + SEARCH_RADIUS_KM / KM_PER_DEG_LAT,
  minLng: SF_CITY_HALL.lng - SEARCH_RADIUS_KM / KM_PER_DEG_LNG,
  maxLng: SF_CITY_HALL.lng + SEARCH_RADIUS_KM / KM_PER_DEG_LNG,
};

export const ADSB_BBOX = BBOX;

interface OpenSkyResponse {
  time?: number;
  states?: Array<Array<unknown>> | null;
}

export interface AdsbDeps {
  fetch?: typeof globalThis.fetch;
  username?: string | undefined;
  password?: string | undefined;
  now?: () => Date;
}

export interface AdsbResult {
  attempted: number;
  rows: NewEnvSignal[];
  dropped: number;
  helicopters: number;
  loiterers: number;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

interface ClassifiedAircraft {
  isHelicopter: boolean;
  isLoiterer: boolean;
}

function classify(
  altitudeM: number | null,
  velocityMs: number | null,
  onGround: boolean,
  category: number | null,
): ClassifiedAircraft {
  // Category 7 (Rotorcraft) per ADS-B emitter category. Strong signal.
  const catHeli = category === 7;
  const heuristicHeli =
    !onGround &&
    altitudeM != null &&
    altitudeM < 600 &&
    velocityMs != null &&
    velocityMs < 60;
  const isHelicopter = catHeli || heuristicHeli;

  const isLoiterer =
    !onGround &&
    altitudeM != null &&
    altitudeM < 1200 &&
    velocityMs != null &&
    velocityMs < 100 &&
    !isHelicopter;

  return { isHelicopter, isLoiterer };
}

export async function fetchAdsb(deps: AdsbDeps = {}): Promise<AdsbResult> {
  const fetchFn = deps.fetch ?? fetch;
  const username = deps.username ?? process.env.OPENSKY_USERNAME;
  const password = deps.password ?? process.env.OPENSKY_PASSWORD;
  const now = deps.now ? deps.now() : new Date();

  const params = new URLSearchParams({
    lamin: String(BBOX.minLat),
    lamax: String(BBOX.maxLat),
    lomin: String(BBOX.minLng),
    lomax: String(BBOX.maxLng),
    extended: "1",
  });

  const headers: Record<string, string> = {};
  if (username && password) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }

  const res = await fetchFn(`${OPENSKY_ENDPOINT}?${params.toString()}`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`adsb_opensky ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as OpenSkyResponse;
  const states = body.states ?? [];

  const rows: NewEnvSignal[] = [];
  let dropped = 0;
  let helicopters = 0;
  let loiterers = 0;

  for (const s of states) {
    if (!Array.isArray(s)) {
      dropped += 1;
      continue;
    }
    const icao24 = s[0] as string | null;
    const callsign = ((s[1] as string | null) ?? "").trim() || icao24 || null;
    const lng = s[5] as number | null;
    const lat = s[6] as number | null;
    const altitudeM = (s[7] as number | null) ?? (s[13] as number | null);
    const onGround = Boolean(s[8]);
    const velocityMs = s[9] as number | null;
    const lastContact = s[4] as number | null;
    const category = (s[17] as number | null) ?? null;

    if (!icao24 || lat == null || lng == null) {
      dropped += 1;
      continue;
    }
    // Defensive radius filter — OpenSky returns the full bbox, which is
    // a square circumscribing our circle.
    const dist = haversineKm({ lat, lng }, SF_CITY_HALL);
    if (dist > SEARCH_RADIUS_KM) {
      dropped += 1;
      continue;
    }

    const cls = classify(altitudeM ?? null, velocityMs ?? null, onGround, category);
    if (!cls.isHelicopter && !cls.isLoiterer) {
      // Plain commuter or transit traffic — skip.
      dropped += 1;
      continue;
    }
    if (cls.isHelicopter) helicopters += 1;
    if (cls.isLoiterer) loiterers += 1;

    const occurredAt =
      typeof lastContact === "number" && Number.isFinite(lastContact)
        ? new Date(lastContact * 1000)
        : now;

    const altFt = altitudeM != null ? Math.round(altitudeM * 3.28084) : null;
    const knots = velocityMs != null ? Math.round(velocityMs * 1.94384) : null;
    const tag = cls.isHelicopter ? "helicopter" : "low-altitude loiter";
    const subtitleParts: string[] = [tag];
    if (altFt != null) subtitleParts.push(`${altFt} ft`);
    if (knots != null) subtitleParts.push(`${knots} kt`);

    rows.push({
      kind: "aircraft",
      source: ADSB_SOURCE,
      sourceUid: icao24,
      lat,
      lng,
      severity: cls.isHelicopter ? "med" : "low",
      title: callsign ?? icao24,
      subtitle: subtitleParts.join(" · "),
      occurredAt,
      // ADS-B is volatile — age out 15 min after last contact.
      expiresAt: new Date(occurredAt.getTime() + 15 * 60 * 1000),
      raw: {
        icao24,
        callsign,
        altitudeM,
        velocityMs,
        onGround,
        category,
        isHelicopter: cls.isHelicopter,
        isLoiterer: cls.isLoiterer,
      } as Record<string, unknown>,
    });
  }

  return { attempted: states.length, rows, dropped, helicopters, loiterers };
}
