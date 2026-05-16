// 511 SF Bay Area Open Data — shared fetch helper.
//
// Auth: an API key obtained from https://511.org/open-data/token is
// passed via the `api_key` URL parameter (NOT a header). Same key works
// for both /traffic/* and /transit/* endpoints. Default quota is 60
// requests per hour per key — well above our 5-minute polling cadence.

export interface SF511Deps {
  fetch: typeof globalThis.fetch;
  apiKey: string;
}

export function buildSF511Url(path: string, params: Record<string, string>, apiKey: string): string {
  const url = new URL(`https://api.511.org${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

export async function sf511Fetch<T = unknown>(
  path: string,
  params: Record<string, string>,
  deps: SF511Deps,
): Promise<T> {
  const url = buildSF511Url(path, params, deps.apiKey);
  const res = await deps.fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`511 fetch failed for ${path}: ${res.status} ${res.statusText}`);
  }
  // 511 occasionally returns a UTF-8 BOM that breaks JSON.parse — strip it.
  const text = await res.text();
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return JSON.parse(clean) as T;
}
