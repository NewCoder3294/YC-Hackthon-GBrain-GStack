// Generic upsert for news_incidents rows.
//
// Mirrors live-incidents upsert but the news table has a unique index
// on source_url (where source_url IS NOT NULL), not (source, source_uid).
// Rows with a null source_url cannot dedup at the DB level so we drop
// them — the news RSS source always sets a link, and the seed loader
// always sets a stable seed:// URL.

import { newsIncidents, type Db, type NewNewsIncident } from "@caltrans/db";
import { sql } from "drizzle-orm";

export async function upsertNewsIncidents(
  db: Db,
  rows: NewNewsIncident[],
): Promise<number> {
  const usable = rows.filter((r) => !!r.sourceUrl);
  if (usable.length === 0) return 0;
  await db
    .insert(newsIncidents)
    .values(usable)
    .onConflictDoUpdate({
      target: newsIncidents.sourceUrl,
      set: {
        title: sql`excluded.title`,
        summary: sql`excluded.summary`,
        crimeType: sql`excluded.crime_type`,
        severity: sql`excluded.severity`,
        neighborhood: sql`excluded.neighborhood`,
        address: sql`excluded.address`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        publishedAt: sql`excluded.published_at`,
        ingestedAt: sql`now()`,
        raw: sql`excluded.raw`,
      },
    });
  return usable.length;
}
