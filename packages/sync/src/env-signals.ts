// Generic upsert for env_signals rows.
//
// Mirrors `upsertLiveIncidents`: batch insert, on conflict on the
// source+source_uid unique constraint refresh the mutable columns. The
// ingestion timestamp is bumped on every poll so the loader can age out
// rows whose source stopped reporting.

import { envSignals, type Db, type NewEnvSignal } from "@caltrans/db";
import { sql } from "drizzle-orm";

export async function upsertEnvSignals(
  db: Db,
  rows: NewEnvSignal[],
): Promise<number> {
  if (rows.length === 0) return 0;
  await db
    .insert(envSignals)
    .values(rows)
    .onConflictDoUpdate({
      target: [envSignals.source, envSignals.sourceUid],
      set: {
        kind: sql`excluded.kind`,
        title: sql`excluded.title`,
        subtitle: sql`excluded.subtitle`,
        severity: sql`excluded.severity`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        occurredAt: sql`excluded.occurred_at`,
        expiresAt: sql`excluded.expires_at`,
        ingestedAt: sql`now()`,
        raw: sql`excluded.raw`,
      },
    });
  return rows.length;
}
