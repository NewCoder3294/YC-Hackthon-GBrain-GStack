import { NextResponse, type NextRequest } from "next/server";
import { createDb } from "@caltrans/db";
import {
  runCorrelation,
  createAdjudicator,
  createLogger,
} from "@caltrans/ingestion";
import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Correlation over the live window can take 1–3 min; mirror the other
// data-sync crons rather than risk the default cutoff.
export const maxDuration = 300;

/** Periodic correlator pass (mirrors /api/cron/sync-cameras). */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL not set" },
      { status: 500 },
    );
  }

  const db = createDb(env.DATABASE_URL);
  try {
    const summary = await runCorrelation({
      db,
      now: new Date(),
      adjudicator: createAdjudicator({}),
      logger: createLogger("cron.correlate"),
    });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "correlation failed",
      },
      { status: 500 },
    );
  }
}
