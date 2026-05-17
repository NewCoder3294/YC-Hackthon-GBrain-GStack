import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createDb } from "@caltrans/db";
import { syncCameras, probeCameraLiveness } from "@caltrans/sync";
import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { CAMERAS_CACHE_TAG } from "@/lib/cameras/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const db = createDb(env.DATABASE_URL);
  try {
    const result = await syncCameras({ db, fetch });
    const probe = await probeCameraLiveness({ db, fetch });
    revalidateTag(CAMERAS_CACHE_TAG);
    return NextResponse.json({ ...result, probe });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}
