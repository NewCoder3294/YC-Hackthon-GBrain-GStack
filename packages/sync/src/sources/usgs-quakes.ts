// USGS earthquakes — past-hour GeoJSON feed filtered to a Bay Area bbox.
//
// Endpoint: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson
// Auth: keyless.
//
// USGS provides hour/day/week/month feeds in fixed magnitude thresholds
// (`all`, `1.0`, `2.5`, `4.5`, `significant`). We pull `all_hour` and
// filter by a bbox larger than SF — Bay Area-wide. Bay seismicity is
// dominated by the Hayward + San Andreas faults; a Hayward quake matters
// to SF dispatch even if its epicenter is in Oakland.

import type { NewEnvSignal } from "@caltrans/db";

export const USGS_QUAKES_SOURCE = "usgs_quakes";

const USGS_ENDPOINT =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

// Bay Area bbox — much larger than SF city. Roughly Santa Rosa down to
// San Jose, Pacific out to the Sierra foothills. A quake within this
// box is "felt in SF" for our purposes.
export const BAY_AREA_BBOX = {
  minLat: 36.8,
  maxLat: 38.6,
  minLng: -123.4,
  maxLng: -121.3,
} as const;

interface UsgsProperties {
  mag?: number | null;
  place?: string | null;
  time?: number | null;
  updated?: number | null;
  tz?: number | null;
  url?: string | null;
  detail?: string | null;
  status?: string | null;
  alert?: string | null;
  type?: string | null;
  title?: string | null;
}

interface UsgsFeature {
  id?: string;
  type?: string;
  properties?: UsgsProperties;
  geometry?: {
    type?: string;
    coordinates?: number[];
  } | null;
}

interface UsgsResponse {
  features?: UsgsFeature[];
}

export interface UsgsQuakesDeps {
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  /** Override the bbox (default Bay Area). */
  bbox?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

function magnitudeSeverity(mag: number): "low" | "med" | "high" {
  if (mag >= 4.0) return "high";
  if (mag >= 2.5) return "med";
  return "low";
}

export interface UsgsQuakesResult {
  attempted: number;
  rows: NewEnvSignal[];
  dropped: number;
}

export async function fetchUsgsQuakes(
  deps: UsgsQuakesDeps = {},
): Promise<UsgsQuakesResult> {
  const fetchFn = deps.fetch ?? fetch;
  const bbox = deps.bbox ?? BAY_AREA_BBOX;

  const res = await fetchFn(USGS_ENDPOINT, {
    headers: { Accept: "application/geo+json" },
  });
  if (!res.ok) {
    throw new Error(`usgs_quakes ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as UsgsResponse;
  const features = body.features ?? [];

  const rows: NewEnvSignal[] = [];
  let dropped = 0;

  for (const feat of features) {
    if (!feat.id) {
      dropped += 1;
      continue;
    }
    const coords = feat.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      dropped += 1;
      continue;
    }
    const lng = coords[0];
    const lat = coords[1];
    if (typeof lat !== "number" || typeof lng !== "number") {
      dropped += 1;
      continue;
    }
    if (
      lat < bbox.minLat ||
      lat > bbox.maxLat ||
      lng < bbox.minLng ||
      lng > bbox.maxLng
    ) {
      dropped += 1;
      continue;
    }

    const props = feat.properties ?? {};
    const mag = typeof props.mag === "number" ? props.mag : null;
    if (mag == null) {
      dropped += 1;
      continue;
    }
    const timeMs = typeof props.time === "number" ? props.time : null;
    if (timeMs == null) {
      dropped += 1;
      continue;
    }
    const occurredAt = new Date(timeMs);
    if (Number.isNaN(occurredAt.getTime())) {
      dropped += 1;
      continue;
    }

    const title = `M${mag.toFixed(1)} ${props.type ?? "earthquake"}`;
    const subtitle = (props.place ?? "Bay Area").trim();

    rows.push({
      kind: "quake",
      source: USGS_QUAKES_SOURCE,
      sourceUid: feat.id,
      lat,
      lng,
      severity: magnitudeSeverity(mag),
      title,
      subtitle: subtitle || null,
      occurredAt,
      // Quakes don't "expire" — but for the active-signals query we age
      // them out after 24h.
      expiresAt: new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000),
      raw: feat as unknown as Record<string, unknown>,
    });
  }

  return { attempted: features.length, rows, dropped };
}
