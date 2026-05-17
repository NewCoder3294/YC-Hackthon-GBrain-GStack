// Helpers for talking to DataSF's Socrata Open Data API (SODA).
//
// All DataSF resources share a base URL of
// https://data.sfgov.org/resource/<resource_id>.json
// and accept Socrata query params ($where, $order, $limit, $offset).
// An app token is optional but raises the per-IP rate limit from
// ~1k req/hr to ~10k req/hr — set it if you have one.

export interface SocrataQuery {
  /** SoQL $where clause, e.g. `received_datetime > '2026-05-16T00:00:00'` */
  where?: string;
  /** SoQL $order clause */
  order?: string;
  /** SoQL $limit (default 1000) */
  limit?: number;
  /** SoQL $offset (default 0) */
  offset?: number;
}

export interface SocrataDeps {
  fetch: typeof globalThis.fetch;
  appToken?: string;
}

export function buildSocrataUrl(
  resourceId: string,
  query: SocrataQuery = {},
): string {
  const base = `https://data.sfgov.org/resource/${resourceId}.json`;
  const params = new URLSearchParams();
  if (query.where) params.set("$where", query.where);
  if (query.order) params.set("$order", query.order);
  params.set("$limit", String(query.limit ?? 1000));
  if (query.offset && query.offset > 0)
    params.set("$offset", String(query.offset));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function socrataFetch<T = unknown>(
  resourceId: string,
  query: SocrataQuery,
  deps: SocrataDeps,
): Promise<T[]> {
  const url = buildSocrataUrl(resourceId, query);
  const headers: Record<string, string> = { accept: "application/json" };
  if (deps.appToken) headers["X-App-Token"] = deps.appToken;
  const res = await deps.fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      `DataSF fetch failed for ${resourceId}: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as T[];
}

// Is the given LA-local date inside US Pacific DST? DST spans the 2nd
// Sunday of March through the 1st Sunday of November.
export function isLAInDST(year: number, month: number, day: number): boolean {
  if (month < 3 || month > 11) return false;
  if (month > 3 && month < 11) return true;
  if (month === 3) {
    const firstDow = new Date(Date.UTC(year, 2, 1)).getUTCDay();
    const secondSunday = (firstDow === 0 ? 1 : 8 - firstDow) + 7;
    return day >= secondSunday;
  }
  const firstDow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstSunday = firstDow === 0 ? 1 : 8 - firstDow;
  return day < firstSunday;
}

// Parse a naive LA-local timestamp ("2026-05-16T14:23:01.000") into a Date
// representing the correct UTC instant. DataSF stores all timestamps as
// naive strings but documents them as Pacific time, so callers that
// previously treated them as UTC were off by 7-8 hours.
export function parseLANaive(raw: string): Date | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, "0")) : 0;
  const offsetHours = isLAInDST(y, mo, d) ? 7 : 8;
  return new Date(Date.UTC(y, mo - 1, d, h + offsetHours, mi, s, ms));
}

// Convert a UTC ISO timestamp back to the naive Pacific-time string
// Socrata's $where clause expects (DataSF compares string literals against
// its naive stored values). The DST offset is computed against the UTC
// date — sufficient for our high-water-mark cursor; the rare edge cases
// around the DST transition hour are not load-bearing.
export function utcIsoToLANaive(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const offsetHours = isLAInDST(y, m, day) ? 7 : 8;
  const la = new Date(d.getTime() - offsetHours * 3600_000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${la.getUTCFullYear()}-${pad(la.getUTCMonth() + 1)}-${pad(la.getUTCDate())}T${pad(la.getUTCHours())}:${pad(la.getUTCMinutes())}:${pad(la.getUTCSeconds())}.${pad(la.getUTCMilliseconds(), 3)}`;
}

// Socrata returns ISO-8601 without TZ for naive timestamps; DataSF
// documents all such timestamps as Pacific time. Honor that.
export function socrataTimestamp(
  raw: string | null | undefined,
): Date | null {
  if (!raw) return null;
  // Already has Z or offset → trust as-is.
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return parseLANaive(raw);
}

// Socrata geometry points come back as { type: "Point", coordinates: [lng, lat] }
// or sometimes { latitude: "37...", longitude: "-122..." }. Normalize both.
export interface SocrataPoint {
  type?: string;
  coordinates?: [number, number] | [string, string];
}

export function extractLatLng(
  point: SocrataPoint | null | undefined,
  fallbackLat?: string | number | null,
  fallbackLng?: string | number | null,
): { lat: number; lng: number } | null {
  if (point?.coordinates) {
    const lng = Number(point.coordinates[0]);
    const lat = Number(point.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0))
      return { lat, lng };
  }
  if (fallbackLat != null && fallbackLng != null) {
    const lat = Number(fallbackLat);
    const lng = Number(fallbackLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0))
      return { lat, lng };
  }
  return null;
}
