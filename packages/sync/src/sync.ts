import { cameras, type Db } from "@caltrans/db";
import { sql } from "drizzle-orm";
import { parseCalTransResponse } from "./caltrans";

export const CALTRANS_D4_URL =
  "https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json";

export interface SyncDeps {
  db: Db;
  fetch: typeof globalThis.fetch;
  url?: string;
}

export async function syncCameras(
  deps: SyncDeps,
): Promise<{ count: number; syncedAt: Date }> {
  const url = deps.url ?? CALTRANS_D4_URL;
  const res = await deps.fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`CalTrans fetch failed: ${res.status}`);
  }
  const json = await res.json();
  const rows = parseCalTransResponse(json);

  if (rows.length === 0) {
    return { count: 0, syncedAt: new Date() };
  }

  // Note: `isActive` is intentionally NOT updated on conflict. It is owned by
  // the liveness probe (`probeCameraLiveness`) after the row is first
  // inserted. CalTrans's `inService` flag is the seed value but is unreliable
  // (many streams it reports as in-service are 404 at the CDN). New rows
  // still get CalTrans's `is_active` value because `set` only runs on update.
  await deps.db
    .insert(cameras)
    .values(rows)
    .onConflictDoUpdate({
      target: cameras.caltransId,
      set: {
        district: sql`excluded.district`,
        route: sql`excluded.route`,
        direction: sql`excluded.direction`,
        mileMarker: sql`excluded.mile_marker`,
        description: sql`excluded.description`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        streamUrl: sql`excluded.stream_url`,
        streamType: sql`excluded.stream_type`,
        lastSyncedAt: sql`now()`,
      },
    });

  return { count: rows.length, syncedAt: new Date() };
}
