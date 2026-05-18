import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { syncWindyCameras } from "@caltrans/sync";
import { adminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { CAMERAS_CACHE_TAG } from "@/lib/cameras/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncWindyCameras(adminClient());
    revalidateTag(CAMERAS_CACHE_TAG);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}
