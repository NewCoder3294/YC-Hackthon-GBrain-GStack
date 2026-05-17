/**
 * IO: upsert GBrain incident `pages` + replace child `tags` over the
 * same Postgres the ingestion uses. Mirrors baseline/gbrain-writer.ts
 * (UNIQUE (source_id, slug); page_kind='markdown'; search_vector
 * auto-filled) — but writes the per-signal `timeline` instead of ''.
 */

import { sql } from "drizzle-orm";
import type { Db } from "@caltrans/db";
import type { IncidentPage } from "./pages";

const SOURCE_ID = "watchdog";

export interface WriteResult {
  written: number;
  failures: { slug: string; message: string }[];
}

async function upsertOne(db: Db, page: IncidentPage): Promise<void> {
  const fmJson = JSON.stringify(page.frontmatter);
  const rows = await db.execute(sql`
    INSERT INTO pages
      (source_id, slug, type, page_kind, title, compiled_truth,
       timeline, frontmatter, created_at, updated_at)
    VALUES
      (${SOURCE_ID}, ${page.slug}, ${page.type}, 'markdown',
       ${page.title}, ${page.compiledTruth}, ${page.timeline},
       ${fmJson}::jsonb, now(), now())
    ON CONFLICT (source_id, slug) DO UPDATE SET
      type = EXCLUDED.type,
      title = EXCLUDED.title,
      compiled_truth = EXCLUDED.compiled_truth,
      timeline = EXCLUDED.timeline,
      frontmatter = EXCLUDED.frontmatter,
      updated_at = now()
    RETURNING id
  `);
  const id = (rows as unknown as { id: number }[])[0]?.id;
  if (id === undefined) throw new Error(`no id returned for ${page.slug}`);

  await db.execute(sql`DELETE FROM tags WHERE page_id = ${id}`);
  for (const tag of page.tags) {
    await db.execute(
      sql`INSERT INTO tags (page_id, tag) VALUES (${id}, ${tag})`,
    );
  }
}

/** Upsert each incident page; one failure never aborts the rest. */
export async function writeIncidentPages(
  db: Db,
  pages: readonly IncidentPage[],
): Promise<WriteResult> {
  const failures: { slug: string; message: string }[] = [];
  let written = 0;
  for (const page of pages) {
    try {
      await upsertOne(db, page);
      written += 1;
    } catch (err: unknown) {
      failures.push({
        slug: page.slug,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { written, failures };
}
