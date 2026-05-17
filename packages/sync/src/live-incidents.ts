// Generic upsert for live_incidents rows.
//
// Mirrors the camera-sync pattern (see ./sync.ts): batch insert, on
// conflict on the source+source_uid unique constraint update the row
// to reflect the latest poll. We refresh `ingested_at` and most mutable
// columns, but we keep `acknowledged_*` and `dismissed_at` columns
// untouched — dispatcher decisions persist across re-polls.

import { liveIncidents, type Db, type NewLiveIncident } from "@caltrans/db";
import { sql } from "drizzle-orm";

export async function upsertLiveIncidents(
  db: Db,
  rows: NewLiveIncident[],
): Promise<number> {
  if (rows.length === 0) return 0;
  await db
    .insert(liveIncidents)
    .values(rows)
    .onConflictDoUpdate({
      target: [liveIncidents.source, liveIncidents.sourceUid],
      set: {
        kind: sql`excluded.kind`,
        title: sql`excluded.title`,
        subtitle: sql`excluded.subtitle`,
        severity: sql`excluded.severity`,
        priority: sql`excluded.priority`,
        status: sql`excluded.status`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        geoPrecision: sql`excluded.geo_precision`,
        neighborhood: sql`excluded.neighborhood`,
        address: sql`excluded.address`,
        occurredAt: sql`excluded.occurred_at`,
        ingestedAt: sql`now()`,
        raw: sql`excluded.raw`,
        // Do NOT overwrite acknowledged_by, acknowledged_at, dismissed_at.
      },
    });
  return rows.length;
}
