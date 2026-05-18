import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Archive can be long when first run on a stale hot table; mirror the
// other data-sync crons' headroom.
export const maxDuration = 300;

const OLDER_THAN_DAYS = 90;
const MAX_ROWS_PER_RUN = 5000;

/**
 * Nightly job. Moves live_incidents rows older than 90 days into
 * live_incidents_archive in batches of 5000 so a stale hot table
 * doesn't time out the cron. Idempotent: ON CONFLICT no-ops on
 * (source, source_uid) duplicates.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("archive_live_incidents", {
    older_than_days: OLDER_THAN_DAYS,
    max_rows: MAX_ROWS_PER_RUN,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    moved: result?.moved ?? 0,
    oldest_kept: result?.oldest ?? null,
    older_than_days: OLDER_THAN_DAYS,
  });
}
