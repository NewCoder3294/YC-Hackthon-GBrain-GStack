// PurpleAir AQI sensors inside the SF bbox.
//
// Docs: https://api.purpleair.com/
// Endpoint: GET https://api.purpleair.com/v1/sensors with a bbox filter.
// Auth: X-API-Key header. Free tier with API key.
//
// We pull outdoor sensors only and request the EPA-corrected PM2.5
// (`pm2.5_atm`) plus location + last-seen timestamps. A single env_signal
// row is written *per sensor*; we also collapse to a city-average row
// (`pm2.5-avg`) so the cockpit panel has a single headline number.
//
// AQI mapping uses the EPA breakpoints for PM2.5 (24h average). Source
// gives an instantaneous reading — close enough for an "is it bad right
// now" indicator. Severity:
//   - AQI <= 100 → low
//   - 100-150    → med ("unhealthy for sensitive")
//   - > 150      → high

import type { NewEnvSignal } from "@caltrans/db";
import { SF_BBOX, isInsideSF } from "../sf-bounds";

export const PURPLEAIR_SOURCE = "purpleair";

const PURPLEAIR_ENDPOINT = "https://api.purpleair.com/v1/sensors";

interface PurpleAirResponse {
  fields?: string[];
  data?: unknown[][];
  max_age?: number;
}

export interface PurpleAirDeps {
  fetch?: typeof globalThis.fetch;
  apiKey?: string | undefined;
  now?: () => Date;
}

export interface PurpleAirResult {
  attempted: number;
  rows: NewEnvSignal[];
  dropped: number;
  disabled?: boolean;
  /** Bbox-wide average AQI, when at least one sensor was usable. */
  averageAqi: number | null;
}

/** EPA PM2.5 → AQI (24h-average breakpoints, applied to instantaneous values). */
export function pm25ToAqi(pm25: number): number {
  const bp: [number, number, number, number][] = [
    [0.0, 12.0, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 500.4, 301, 500],
  ];
  const clamped = Math.max(0, pm25);
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (clamped >= cLo && clamped <= cHi) {
      return Math.round(((iHi - iLo) / (cHi - cLo)) * (clamped - cLo) + iLo);
    }
  }
  return 500;
}

function aqiSeverity(aqi: number): "low" | "med" | "high" {
  if (aqi > 150) return "high";
  if (aqi > 100) return "med";
  return "low";
}

function aqiLabel(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "USG"; // unhealthy for sensitive groups
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

export async function fetchPurpleAir(
  deps: PurpleAirDeps = {},
): Promise<PurpleAirResult> {
  const apiKey = deps.apiKey ?? process.env.PURPLEAIR_API_KEY;
  if (!apiKey) {
    return {
      attempted: 0,
      rows: [],
      dropped: 0,
      averageAqi: null,
      disabled: true,
    };
  }
  const fetchFn = deps.fetch ?? fetch;
  const now = deps.now ? deps.now() : new Date();

  // sensor_index is always returned by PurpleAir as column 0 regardless
  // of `fields` (per their docs), so we don't repeat it here.
  const params = new URLSearchParams({
    fields: "name,latitude,longitude,pm2.5_atm,last_seen,location_type",
    nwlng: String(SF_BBOX.minLng),
    nwlat: String(SF_BBOX.maxLat),
    selng: String(SF_BBOX.maxLng),
    selat: String(SF_BBOX.minLat),
    // location_type=0 → outdoor only.
    location_type: "0",
    // 1h max age — avoids stale offline sensors dominating the average.
    max_age: "3600",
  });

  const res = await fetchFn(`${PURPLEAIR_ENDPOINT}?${params.toString()}`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`purpleair ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as PurpleAirResponse;
  const fields = body.fields ?? [];
  const data = body.data ?? [];

  const idx = (name: string) => fields.indexOf(name);
  const iSensor = idx("sensor_index");
  const iName = idx("name");
  const iLat = idx("latitude");
  const iLng = idx("longitude");
  const iPm = idx("pm2.5_atm");
  const iSeen = idx("last_seen");

  const rows: NewEnvSignal[] = [];
  let dropped = 0;
  const aqiSamples: number[] = [];

  for (const row of data) {
    const sensorId = iSensor >= 0 ? (row[iSensor] as number | string | null) : null;
    const lat = iLat >= 0 ? (row[iLat] as number | null) : null;
    const lng = iLng >= 0 ? (row[iLng] as number | null) : null;
    const pm = iPm >= 0 ? (row[iPm] as number | null) : null;
    const seenUnix = iSeen >= 0 ? (row[iSeen] as number | null) : null;
    const name = iName >= 0 ? (row[iName] as string | null) : null;

    if (
      sensorId == null ||
      lat == null ||
      lng == null ||
      pm == null ||
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      typeof pm !== "number" ||
      !Number.isFinite(pm)
    ) {
      dropped += 1;
      continue;
    }
    if (!isInsideSF(lat, lng)) {
      dropped += 1;
      continue;
    }

    const aqi = pm25ToAqi(pm);
    aqiSamples.push(aqi);

    const occurredAt =
      typeof seenUnix === "number" && Number.isFinite(seenUnix)
        ? new Date(seenUnix * 1000)
        : now;
    if (Number.isNaN(occurredAt.getTime())) {
      dropped += 1;
      continue;
    }

    rows.push({
      kind: "aqi",
      source: PURPLEAIR_SOURCE,
      sourceUid: `sensor-${sensorId}`,
      lat,
      lng,
      severity: aqiSeverity(aqi),
      title: `AQI ${aqi}`,
      subtitle: `${aqiLabel(aqi)} · ${name ?? "PurpleAir sensor"}`,
      occurredAt,
      expiresAt: new Date(occurredAt.getTime() + 60 * 60 * 1000),
      raw: { sensorId, name, lat, lng, pm25: pm, aqi, seenUnix } as Record<string, unknown>,
    });
  }

  let averageAqi: number | null = null;
  if (aqiSamples.length > 0) {
    averageAqi = Math.round(
      aqiSamples.reduce((a, b) => a + b, 0) / aqiSamples.length,
    );
    // Synthetic city-wide average row — keyed on a stable source_uid so
    // it upserts in place each poll.
    rows.push({
      kind: "aqi",
      source: PURPLEAIR_SOURCE,
      sourceUid: "sf-avg",
      lat: 37.779,
      lng: -122.4194,
      severity: aqiSeverity(averageAqi),
      title: `SF Avg AQI ${averageAqi}`,
      subtitle: `${aqiLabel(averageAqi)} · ${aqiSamples.length} sensors`,
      occurredAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      raw: { averageAqi, sampleCount: aqiSamples.length } as Record<string, unknown>,
    });
  }

  return {
    attempted: data.length,
    rows,
    dropped,
    averageAqi,
  };
}
