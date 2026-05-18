// URL <-> map filter state encoder. Canonical so identical views produce
// identical URLs (permalink contract). Keep keys short to bound URL length.
//
// Schema (all keys optional; default omits them):
//   z   - zoom (number, 1 decimal)
//   c   - center "lat,lng" (4 decimals)
//   t   - time window "-Nh" or "iso8601" — defaults to "now" (omit)
//   L   - hidden layer ids, comma-separated (e.g. "cameras,news")
//   p   - polygon, encoded as "lat:lng,lat:lng,..." (4 decimals each)
//   i   - selected incident id
//   h   - heatmap mode flag ("1" when on)

export type LayerId =
  | "cameras"
  | "news"
  | "live"
  | "fixtures";

export interface MapState {
  zoom: number;
  center: [number, number]; // [lng, lat]
  /** Time window anchor relative to now (negative hours). 0 = "now". */
  timeOffsetHours: number;
  hiddenLayers: Set<LayerId>;
  polygon: Array<[number, number]> | null; // [[lng, lat], ...]
  selectedIncidentId: string | null;
  heatmap: boolean;
}

export const DEFAULT_STATE: MapState = {
  zoom: 12,
  center: [-122.4194, 37.7749],
  timeOffsetHours: 0,
  hiddenLayers: new Set(),
  polygon: null,
  selectedIncidentId: null,
  heatmap: false,
};

function fixed(n: number, d: number): string {
  return Number(n.toFixed(d)).toString();
}

export function encodeMapState(state: MapState): URLSearchParams {
  const p = new URLSearchParams();
  if (Math.abs(state.zoom - DEFAULT_STATE.zoom) > 0.05) {
    p.set("z", fixed(state.zoom, 1));
  }
  if (
    Math.abs(state.center[0] - DEFAULT_STATE.center[0]) > 0.0005 ||
    Math.abs(state.center[1] - DEFAULT_STATE.center[1]) > 0.0005
  ) {
    p.set("c", `${fixed(state.center[1], 4)},${fixed(state.center[0], 4)}`);
  }
  if (state.timeOffsetHours !== 0) {
    p.set("t", `${state.timeOffsetHours}h`);
  }
  if (state.hiddenLayers.size > 0) {
    p.set("L", Array.from(state.hiddenLayers).sort().join(","));
  }
  if (state.polygon && state.polygon.length >= 3) {
    p.set(
      "p",
      state.polygon
        .map(([lng, lat]) => `${fixed(lat, 4)}:${fixed(lng, 4)}`)
        .join(","),
    );
  }
  if (state.selectedIncidentId) {
    p.set("i", state.selectedIncidentId);
  }
  if (state.heatmap) {
    p.set("h", "1");
  }
  return p;
}

function parseNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function decodeMapState(params: URLSearchParams): MapState {
  const state: MapState = {
    ...DEFAULT_STATE,
    hiddenLayers: new Set(),
    polygon: null,
  };
  const z = params.get("z");
  if (z) state.zoom = parseNumber(z, DEFAULT_STATE.zoom);

  const c = params.get("c");
  if (c) {
    const [lat, lng] = c.split(",").map((s) => parseNumber(s, NaN));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      state.center = [lng, lat];
    }
  }

  const t = params.get("t");
  if (t) {
    const m = t.match(/^(-?\d+(?:\.\d+)?)h$/);
    if (m) state.timeOffsetHours = parseNumber(m[1], 0);
  }

  const L = params.get("L");
  if (L) {
    L.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((id) => state.hiddenLayers.add(id as LayerId));
  }

  const p = params.get("p");
  if (p) {
    const pts: Array<[number, number]> = [];
    for (const pair of p.split(",")) {
      const [latStr, lngStr] = pair.split(":");
      const lat = parseNumber(latStr, NaN);
      const lng = parseNumber(lngStr, NaN);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        pts.push([lng, lat]);
      }
    }
    if (pts.length >= 3) state.polygon = pts;
  }

  const i = params.get("i");
  if (i) state.selectedIncidentId = i;

  if (params.get("h") === "1") state.heatmap = true;

  return state;
}

/** Build a permalink URL from current state. */
export function buildPermalink(state: MapState, basePath = "/map"): string {
  const params = encodeMapState(state);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Returns true when two states would produce the same URL. */
export function statesEqual(a: MapState, b: MapState): boolean {
  return encodeMapState(a).toString() === encodeMapState(b).toString();
}
