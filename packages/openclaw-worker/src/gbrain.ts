import { getSql } from "./db";
import { getConfig } from "./config";
import { log } from "./logger";

/**
 * Direct writes to the gbrain `pages` + `tags` tables Nick created in Supabase
 * per `docs/GBRAIN_HANDOFF.md`. We bypass the gbrain SDK because (a) the
 * worker runs inside the same Postgres anyway, (b) the SDK would pull in
 * pgvector / embeddings machinery we don't need to *write* a page.
 *
 * Slugs are deterministic where it makes sense (`pattern-<key>`) so repeated
 * detections of the same recurring signature upsert instead of duplicate;
 * one-off detections get an opaque id.
 */

export type GbrainPageKind =
  | "pattern"
  | "intel_note"
  | "baseline"
  | "reviewed_incident";

export interface PutPageInput {
  slug: string;
  type: GbrainPageKind;
  title: string;
  /** Markdown body — gbrain stores this in `compiled_truth` */
  body: string;
  tags: string[];
  frontmatter?: Record<string, unknown>;
}

export interface PutPageResult {
  pageId: number;
  inserted: boolean;
}

export async function putGbrainPage(input: PutPageInput): Promise<PutPageResult> {
  const cfg = getConfig();
  if (!cfg.GBRAIN_PAGES_ENABLED) {
    log.debug({
      scope: "gbrain",
      msg: "skipped (GBRAIN_PAGES_ENABLED=false)",
      extra: { slug: input.slug },
    });
    return { pageId: -1, inserted: false };
  }

  const sql = getSql();
  const frontmatter = {
    kind: input.type,
    source: "openclaw-worker",
    ...input.frontmatter,
  };

  // Upsert by (source_id, slug). Returning xmax=0 → row was newly inserted.
  // jsonb cast via stringified text to side-step postgres-js's sql.json helper
  // (which expects a different code path under the templated form here).
  const frontmatterJson = JSON.stringify(frontmatter);
  const rows = await sql<Array<{ id: number; was_insert: boolean }>>`
    INSERT INTO pages (source_id, slug, type, page_kind, title, compiled_truth, frontmatter)
    VALUES (
      ${cfg.GBRAIN_SOURCE_ID},
      ${input.slug},
      ${input.type},
      ${"markdown"},
      ${input.title},
      ${input.body},
      ${frontmatterJson}::jsonb
    )
    ON CONFLICT (source_id, slug) DO UPDATE
      SET title = EXCLUDED.title,
          compiled_truth = EXCLUDED.compiled_truth,
          frontmatter = EXCLUDED.frontmatter,
          updated_at = now()
    RETURNING id, (xmax = 0) AS was_insert
  `;

  const row = rows[0];
  if (!row) {
    throw new Error(`gbrain page upsert returned no rows (slug=${input.slug})`);
  }
  const { id, was_insert } = row;

  // Refresh tags — clear then re-insert so re-emits don't accumulate stale tags.
  await sql`DELETE FROM tags WHERE page_id = ${id}`;
  if (input.tags.length > 0) {
    const dedupedTags = Array.from(new Set(input.tags));
    await sql`
      INSERT INTO tags (page_id, tag)
      SELECT ${id}, unnest(${dedupedTags}::text[])
    `;
  }

  log.info({
    scope: "gbrain",
    msg: was_insert ? "page inserted" : "page updated",
    extra: { slug: input.slug, type: input.type, tag_count: input.tags.length },
  });

  return { pageId: id, inserted: was_insert };
}

/**
 * Emit an "openclaw detected pattern" page. Used when the fusion correlator
 * notices a signal-mix it can't explain via existing patterns (e.g., a new
 * cam+911 ≤30s recurrence at a corner).
 */
export interface PatternPageArgs {
  patternKey: string;
  title: string;
  description: string;
  /** Pre-computed region/source tags. `pattern:` prefix added automatically. */
  tags: string[];
  samples?: number;
  confidence?: number;
  region?: string;
}

export async function putPatternPage(args: PatternPageArgs): Promise<PutPageResult> {
  const slug = `pattern-${args.patternKey}`;
  return putGbrainPage({
    slug,
    type: "pattern",
    title: args.title,
    body: args.description,
    tags: [
      `pattern:${args.patternKey}`,
      ...(args.region ? [`region:${args.region}`] : []),
      ...args.tags,
    ],
    frontmatter: {
      samples: args.samples ?? null,
      confidence: args.confidence ?? null,
    },
  });
}

/**
 * Emit an intel_note describing what the OpenClaw worker just observed.
 * Useful when the dispatcher hasn't decided yet but we want gbrain to have a
 * record of the observation so a follow-up can cite it.
 */
export interface IntelNotePageArgs {
  noteId: string;
  title: string;
  body: string;
  tags: string[];
  relatedIncidentId?: string;
  relatedGangId?: string;
}

export async function putIntelNotePage(args: IntelNotePageArgs): Promise<PutPageResult> {
  const slug = `openclaw-intel-${args.noteId}`;
  return putGbrainPage({
    slug,
    type: "intel_note",
    title: args.title,
    body: args.body,
    tags: ["intel:openclaw", ...args.tags],
    frontmatter: {
      related_incident_id: args.relatedIncidentId ?? null,
      related_gang_id: args.relatedGangId ?? null,
    },
  });
}
