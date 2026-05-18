// Map filter shape shared between the GBrain natural-language ask, the
// URL encoder, and the server-side query in /map. Kept deliberately
// flat so it round-trips through search params without nested objects.
//
// All fields are optional. The map page treats an empty filter as
// "show everything in the default window."

export interface MapFilter {
  /** Source IDs from live_incidents.source. */
  sources?: string[];
  /** Severity tier(s). */
  severities?: Array<"low" | "med" | "high">;
  /** SF neighborhoods (matched against live_incidents.neighborhood). */
  neighborhoods?: string[];
  /** Free-text fragments matched (case-insensitive) against title. */
  titleContains?: string[];
  /** Earliest occurred_at ISO. */
  since?: string;
  /** Latest occurred_at ISO. */
  until?: string;
}

const KEYS = [
  "sources",
  "severities",
  "neighborhoods",
  "titleContains",
  "since",
  "until",
] as const;

export function encodeFilter(filter: MapFilter): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const v = filter[key];
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      params.set(key, v.join("|"));
    } else if (typeof v === "string" && v) {
      params.set(key, v);
    }
  }
  return params;
}

export function decodeFilter(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): MapFilter {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const list = (key: string): string[] | undefined => {
    const raw = get(key);
    if (!raw) return undefined;
    const parts = raw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  };

  const filter: MapFilter = {};
  const sources = list("sources");
  if (sources) filter.sources = sources;
  const severities = list("severities")?.filter(
    (s): s is "low" | "med" | "high" =>
      s === "low" || s === "med" || s === "high",
  );
  if (severities && severities.length) filter.severities = severities;
  const neighborhoods = list("neighborhoods");
  if (neighborhoods) filter.neighborhoods = neighborhoods;
  const titleContains = list("titleContains");
  if (titleContains) filter.titleContains = titleContains;
  const since = get("since");
  if (since) filter.since = since;
  const until = get("until");
  if (until) filter.until = until;
  return filter;
}

export function isFilterEmpty(filter: MapFilter): boolean {
  return (
    !filter.sources?.length &&
    !filter.severities?.length &&
    !filter.neighborhoods?.length &&
    !filter.titleContains?.length &&
    !filter.since &&
    !filter.until
  );
}

export function describeFilter(filter: MapFilter): string[] {
  const chips: string[] = [];
  if (filter.since) {
    const hrs = Math.max(
      1,
      Math.round((Date.now() - new Date(filter.since).getTime()) / 3_600_000),
    );
    chips.push(`since ${hrs}h ago`);
  }
  if (filter.until) chips.push(`until ${new Date(filter.until).toISOString()}`);
  if (filter.sources?.length) chips.push(`source: ${filter.sources.join(", ")}`);
  if (filter.severities?.length)
    chips.push(`severity: ${filter.severities.join(", ")}`);
  if (filter.neighborhoods?.length)
    chips.push(`area: ${filter.neighborhoods.join(", ")}`);
  if (filter.titleContains?.length)
    chips.push(`re: ${filter.titleContains.join(", ")}`);
  return chips;
}
