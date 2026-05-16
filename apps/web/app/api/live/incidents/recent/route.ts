import { NextResponse } from "next/server";
import { listLiveIncidents } from "@/app/(app)/live/data";

export const runtime = "nodejs";
export const revalidate = 30;

// Returns the most-recent live SF incidents in JSON for client polling.
// Window defaults to the last 4 hours of `occurred_at`, capped at 200 rows.
// The orchestrator cron writes to `live_incidents` upstream; this endpoint
// just reads.
export async function GET() {
  try {
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const rows = await listLiveIncidents({ since });
    // Drop rows without coordinates — feed UI needs lat/lng for the map pin.
    const usable = rows.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && (r.lat !== 0 || r.lng !== 0));
    return NextResponse.json({
      incidents: usable,
      count: usable.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed", incidents: [] },
      { status: 500 },
    );
  }
}
