/**
 * Socrata SODA client for DataSF dataset wg3w-h783.
 *
 * Offset pagination ordered by incident_datetime, optional $where date
 * window, optional X-App-Token (works without it — just throttled),
 * throttle between pages, exponential backoff on HTTP 429.
 *
 * `fetch` and `sleep` are injected so pagination/backoff are unit-tested
 * with zero network and zero real delay (mirrors the DI style of
 * @caltrans/sync's syncCameras and camera/pins.ts).
 */

export const DATASF_ENDPOINT =
  "https://data.sfgov.org/resource/wg3w-h783.json";

export interface PageQuery {
  /** Floating-timestamp lower bound, e.g. "2025-05-01T00:00:00". */
  readonly sinceIso: string;
  readonly limit: number;
  readonly offset: number;
}

/** Pure: build the SODA query string for one page. Exported for tests. */
export function buildQuery(q: PageQuery): string {
  const params = new URLSearchParams();
  params.set("$order", "incident_datetime");
  params.set("$limit", String(q.limit));
  params.set("$offset", String(q.offset));
  params.set("$where", `incident_datetime > '${q.sinceIso}'`);
  return params.toString();
}

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Socrata rate limited (429); retry after ${retryAfterMs}ms`);
    this.name = "RateLimitedError";
  }
}

export interface FetchDeps {
  readonly fetch: typeof globalThis.fetch;
  /** Injectable for tests (no real delays). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Optional Socrata app token (X-App-Token). */
  readonly appToken?: string | undefined;
  /** Override endpoint (tests). */
  readonly endpoint?: string;
}

export interface FetchOptions {
  readonly sinceIso: string;
  readonly pageLimit: number;
  readonly maxRows: number;
  readonly throttleMs: number;
  /** Max 429 retries per page before giving up. Default 4. */
  readonly maxRetries?: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, Math.max(0, ms)));

function parseRetryAfterMs(header: string | null): number {
  if (header === null) return 1000;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  return 1000;
}

async function fetchPage(
  deps: FetchDeps,
  query: string,
  maxRetries: number,
): Promise<unknown[]> {
  const endpoint = deps.endpoint ?? DATASF_ENDPOINT;
  const sleep = deps.sleep ?? defaultSleep;
  const headers: Record<string, string> = { accept: "application/json" };
  if (deps.appToken !== undefined && deps.appToken.length > 0) {
    headers["X-App-Token"] = deps.appToken;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await deps.fetch(`${endpoint}?${query}`, { headers });
    if (res.status === 429) {
      if (attempt === maxRetries) {
        throw new RateLimitedError(
          parseRetryAfterMs(res.headers.get("retry-after")),
        );
      }
      const backoff =
        parseRetryAfterMs(res.headers.get("retry-after")) * (attempt + 1);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Socrata fetch failed: ${res.status} ${res.statusText}`);
    }
    const json: unknown = await res.json();
    if (!Array.isArray(json)) {
      throw new Error("Socrata response was not a JSON array");
    }
    return json;
  }
  // Unreachable: loop either returns or throws.
  throw new Error("fetchPage: exhausted retries");
}

/**
 * Page through the dataset (offset pagination) until exhausted or
 * `maxRows` reached. Returns raw rows for the mapper to validate.
 */
export async function fetchIncidents(
  deps: FetchDeps,
  opts: FetchOptions,
): Promise<unknown[]> {
  const sleep = deps.sleep ?? defaultSleep;
  const maxRetries = opts.maxRetries ?? 4;
  const out: unknown[] = [];
  let offset = 0;

  while (out.length < opts.maxRows) {
    const remaining = opts.maxRows - out.length;
    const limit = Math.min(opts.pageLimit, remaining);
    const page = await fetchPage(
      deps,
      buildQuery({ sinceIso: opts.sinceIso, limit, offset }),
      maxRetries,
    );
    out.push(...page);
    if (page.length < limit) break; // last page
    offset += page.length;
    if (out.length < opts.maxRows && opts.throttleMs > 0) {
      await sleep(opts.throttleMs);
    }
  }
  return out;
}

/** Floating-timestamp string Socrata expects (no trailing Z). */
export function socrataSince(from: Date): string {
  return from.toISOString().replace(/\.\d{3}Z$/, "").replace(/Z$/, "");
}
