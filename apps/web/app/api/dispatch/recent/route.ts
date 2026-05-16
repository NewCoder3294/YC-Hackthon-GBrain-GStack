import { NextResponse } from "next/server";
import { fetchRecentDispatch } from "@/lib/dispatch-fetch";

export const runtime = "nodejs";
export const revalidate = 30;

// The SFGov dataset publishes with a multi-hour lag (no real-time stream),
// so a strict wall-clock window like `received_datetime > now - 2h` often
// returns 0 rows. We honor the spirit of the "don't overwhelm" cap by
// returning the 200 most recent geocoded calls instead.
export async function GET() {
  const calls = await fetchRecentDispatch({ limit: 200, revalidate: 30 });
  return NextResponse.json({ calls, fetchedAt: new Date().toISOString() });
}
