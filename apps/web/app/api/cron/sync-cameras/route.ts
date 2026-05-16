import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createDb } from "@caltrans/db";
import { syncCameras } from "@caltrans/sync";
import { env } from "@/lib/env";
import { CAMERAS_CACHE_TAG } from "@/lib/cameras/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const db = createDb(env.DATABASE_URL);
  try {
    const result = await syncCameras({ db, fetch });
    revalidateTag(CAMERAS_CACHE_TAG);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}
