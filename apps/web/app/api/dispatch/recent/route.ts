import { NextResponse } from "next/server";
import { normalizeDispatchCalls } from "@/lib/dispatch";

export const runtime = "nodejs";
export const revalidate = 30;

// SF Open Data dispatch dataset (Socrata `gnap-fj3t`).
// The v3 endpoint `/api/v3/views/gnap-fj3t/query.json` requires auth; the
// public `/resource/` endpoint serves the same data without auth. If
// `SF_OPEN_DATA_APP_TOKEN` is set, it is sent as `X-App-Token` (higher rate
// limits, lets you swap to the v3 path if you want).
const SODA_URL = "https://data.sfgov.org/resource/gnap-fj3t.json";

// The dataset publishes with a multi-hour lag (no real-time stream), so a
// strict `received_datetime > now - 2h` filter often returns 0 rows. We
// honor the spirit of the user's "don't overwhelm" cap by limiting to the
// 200 most recent geocoded calls in the dataset instead of a strict wall
// clock window.
const RECENT_LIMIT = 200;

export async function GET() {
  const params = new URLSearchParams({
    $where: "intersection_point IS NOT NULL",
    $order: "received_datetime DESC",
    $limit: String(RECENT_LIMIT),
  });

  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.SF_OPEN_DATA_APP_TOKEN) {
    headers["X-App-Token"] = process.env.SF_OPEN_DATA_APP_TOKEN;
  }

  try {
    const res = await fetch(`${SODA_URL}?${params.toString()}`, {
      headers,
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}`, calls: [] },
        { status: 502 },
      );
    }
    const raw = await res.json();
    const calls = normalizeDispatchCalls(raw);
    return NextResponse.json({ calls, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed", calls: [] },
      { status: 500 },
    );
  }
}
