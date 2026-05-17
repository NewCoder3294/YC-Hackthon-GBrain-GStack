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

/** Bounded write concurrency — fast without flooding the connection. */
const WRITE_CONCURRENCY = 8;

/**
 * Upsert incident pages in bounded-concurrency batches; one failure
 * never aborts the rest (per-page isolation preserved).
 */
export async function writeIncidentPages(
  db: Db,
  pages: readonly IncidentPage[],
): Promise<WriteResult> {
  const failures: { slug: string; message: string }[] = [];
  let written = 0;

  for (let i = 0; i < pages.length; i += WRITE_CONCURRENCY) {
    const batch = pages.slice(i, i + WRITE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (page) => {
        try {
          await upsertOne(db, page);
          return { ok: true as const };
        } catch (err: unknown) {
          return {
            ok: false as const,
            slug: page.slug,
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    for (const r of results) {
      if (r.ok) written += 1;
      else failures.push({ slug: r.slug, message: r.message });
    }
  }
  return { written, failures };
}
