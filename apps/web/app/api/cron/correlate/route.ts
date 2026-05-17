import { NextResponse, type NextRequest } from "next/server";
import { createDb } from "@caltrans/db";
import {
  runCorrelation,
  createAdjudicator,
  createLogger,
} from "@caltrans/ingestion";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Periodic correlator pass (mirrors /api/cron/sync-cameras). */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
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
