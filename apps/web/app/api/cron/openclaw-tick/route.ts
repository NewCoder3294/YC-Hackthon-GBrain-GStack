import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Tick can spend up to ~60s in scripted mode (ingest POST + gbrain writes);
// in fusion mode it adds LLM enrichment per qualified cluster. Match the
// other data crons' headroom.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Worker's INGEST_URL defaults to localhost — point it at this same
  // deployment so the cron tick hits our own /api/openclaw/ingest. Honor
  // an explicit override (staging, etc.) if one is set.
  if (!process.env.INGEST_URL && process.env.VERCEL_URL) {
    process.env.INGEST_URL = `https://${process.env.VERCEL_URL}/api/openclaw/ingest`;
  }

  // Dynamic import so the worker package only loads on this route, not on
  // every Next.js page that touches `apps/web`.
  const { runTick } = await import("@caltrans/openclaw-worker");

  try {
    const result = await runTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tick failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
