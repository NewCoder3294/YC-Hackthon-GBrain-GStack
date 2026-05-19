import { NextResponse, type NextRequest } from "next/server";
import { lookupNeighborhoodCentroid } from "@caltrans/sync";
import { adminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { revalidateTag } from "next/cache";
import { CAMERAS_CACHE_TAG } from "@/lib/cameras/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Fill missing lat/lng on live_incidents using the SF analysis-neighborhood
 * centroid lookup. Rows tagged `geo_precision='neighborhood'` so the map
 * can render them visually distinct from intersection-precise pins.
 *
 * Idempotent — once a row has coords it never gets touched again. Runs
 * nightly so freshly-ingested rows from sources that don't geocode
 * (scanner audio, news RSS, etc.) get a best-effort fix.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = adminClient();
  const lookbackHours = Number(
    request.nextUrl.searchParams.get("hours") ?? "168", // 7 days default
  );
  const since = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows, error } = await supabase
    .from("live_incidents")
    .select("id, neighborhood")
    .is("lat", null)
    .not("neighborhood", "is", null)
    .gte("occurred_at", since)
    .limit(2000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const candidates = (rows ?? []) as Array<{ id: string; neighborhood: string }>;

  let updated = 0;
  let skipped = 0;
  for (const row of candidates) {
    const centroid = lookupNeighborhoodCentroid(row.neighborhood);
    if (!centroid) {
      skipped += 1;
      continue;
    }
    const { error: updErr } = await supabase
      .from("live_incidents")
      .update({
        lat: centroid.lat,
        lng: centroid.lng,
        geo_precision: "neighborhood",
      })
      .eq("id", row.id);
    if (updErr) {
      skipped += 1;
      continue;
    }
    updated += 1;
  }

  if (updated > 0) revalidateTag(CAMERAS_CACHE_TAG);

  return NextResponse.json({
    considered: candidates.length,
    updated,
    skipped,
    since,
  });
}
