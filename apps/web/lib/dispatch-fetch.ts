import "server-only";
import { normalizeDispatchCalls, type DispatchCall } from "./dispatch";

// SF Open Data dispatch dataset (Socrata `gnap-fj3t`). The v3 endpoint
// `/api/v3/views/gnap-fj3t/query.json` requires auth; the `/resource/` path
// serves the same rows without auth. If `SF_OPEN_DATA_APP_TOKEN` is set we
// forward it as `X-App-Token` for higher rate limits (works for both paths).
const SODA_URL = "https://data.sfgov.org/resource/gnap-fj3t.json";

export interface FetchDispatchOptions {
  limit?: number;
  revalidate?: number;
}

export async function fetchRecentDispatch(
  opts: FetchDispatchOptions = {},
): Promise<DispatchCall[]> {
  const { limit = 200, revalidate = 30 } = opts;
  const params = new URLSearchParams({
    $where: "intersection_point IS NOT NULL",
    $order: "received_datetime DESC",
    $limit: String(limit),
  });

  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.SF_OPEN_DATA_APP_TOKEN) {
    headers["X-App-Token"] = process.env.SF_OPEN_DATA_APP_TOKEN;
  }

  try {
    const res = await fetch(`${SODA_URL}?${params.toString()}`, {
      headers,
      next: { revalidate },
    });
    if (!res.ok) return [];
    const raw = await res.json();
    return normalizeDispatchCalls(raw);
  } catch {
    return [];
  }
}
