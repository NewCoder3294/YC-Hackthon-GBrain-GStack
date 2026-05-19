import { NextResponse, type NextRequest } from "next/server";
import { createDb } from "@caltrans/db";
import { syncNewsIncidents } from "@caltrans/sync";
import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Polling four feeds in parallel can take a few seconds; bump the
// route timeout so a slow upstream doesn't kill the whole job.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const db = createDb(env.DATABASE_URL);
  try {
    const result = await syncNewsIncidents({ db, fetch, force });
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}
