# DataSF → GBrain Neighborhood-Baseline Rollup — Design (2026-05-16)

**Status:** approved design, ready for implementation plan.
**Why:** the `datasf` producer writes real SFPD incidents to `signal_events`
but nothing reads them. This rollup turns that ingested data into GBrain
`baseline`/`pattern` pages, which the KG already renders and `gbrain_search`
already indexes — making DataSF actually useful with no new consumer.

## 1. Architecture

A producer-style module `packages/ingestion/src/baseline/`, run via
`pnpm --filter @caltrans/ingestion baseline`. It:

1. reads only `signal_events WHERE payload->>'feed' =
   'datasf_sfpd_incidents'` (single source of truth — the rows the
   `datasf` producer already ingested; no second Socrata call),
2. aggregates per `analysis_neighborhood` in pure TS,
3. upserts GBrain `pages` + child `tags` over the **same `DATABASE_URL`**
   (GBrain lives in the same Supabase project; verified).

Pure aggregation is isolated from IO (mirrors `calls/generator.ts` vs
`calls/run.ts`). No new deps. No GBrain SDK/CLI/MCP — a plain `pages`
insert is FTS-indexed automatically by the `BEFORE INSERT/UPDATE`
trigger `trg_pages_search_vector` (verified on the live schema).

## 2. Components (files)

| File | Purpose | IO? | Tested |
|---|---|---|---|
| `metrics.ts` | rows → per-neighborhood aggregates + cross-neighborhood disparity | pure | unit |
| `pages.ts` | aggregates → GBrain page objects (slug/title/markdown/frontmatter/tags) | pure | unit |
| `gbrain-writer.ts` | upsert `pages` + replace child `tags` via `@caltrans/db` | IO | typecheck + manual |
| `run.ts` | IO shell: `--days N`, env, load-env, logger, entrypoint guard | IO | typecheck + manual |
| `metrics.test.ts`, `pages.test.ts` | vitest, fixtures, no network/DB | — | — |
| `package.json` | add `"baseline": "tsx src/baseline/run.ts"` | — | — |

## 3. Data flow & metrics

Read `signal_events` (filter `payload.feed = 'datasf_sfpd_incidents'`),
pull `occurred_at`, `lat`, `lng`, `payload` (`category`, `subcategory`,
`description`, `neighborhood`, `policeDistrict`, `resolution`). Group by
`payload.neighborhood` (skip null/empty → bucket "Unknown", excluded from
ranked output).

Per neighborhood compute:
- **counts**: total + windows 7/30/90/365d (relative to run time).
- **trend**: current-30d vs prior-30d, signed % change.
- **category mix**: top-5 `category` by count (+ share %).
- **clearance/resolution rate**: bucket `resolution` →
  `enforcement` = {"Cite or Arrest Adult", "Cite or Arrest Juvenile",
  "Exceptional Adult", "Exceptional Juvenile"}; `unfounded` =
  {"Unfounded"}; `open` = {"Open or Active", "", null, anything else}.
  Rate = enforcement / total.

**Disparity (labeled proxy):** rank neighborhoods by incident density and
by clearance rate; report the spread (top vs bottom, ratio). Caption,
verbatim, on the disparity page and in this spec:

> Proxy equity signal derived from reported-incident volume + clearance
> outcomes only. This is **not** the TRD under-policing
> (reports/responses) or indiscriminate (stops/incidents) ratio — those
> require dispatch-response and stop data this system does not have.
> Treat as a starting lens, not a conclusion.

## 4. GBrain page contract (mirrors live `type='baseline'` rows exactly)

All rows `source_id = 'watchdog'`; `id` omitted (sequence
`pages_id_seq`); `page_kind = 'markdown'`; `timeline = ''`;
`content_hash = null`; `created_at`/`updated_at = now()`.

Pages written (individual pages = **top 10 neighborhoods by total
volume**; rollup and disparity pages aggregate **all** neighborhoods):
- 10 `baseline-datasf-sf-<nbhd-slug>` — the top-10 neighborhoods —
  `type = 'baseline'`.
- one `baseline-datasf-sf-rollup` — full table, all neighborhoods —
  `type = 'baseline'`.
- one `pattern-datasf-sf-neighborhood-disparity` — proxy story, ranks
  all neighborhoods — `type = 'pattern'` (reads as an insight, like
  other `pattern` pages).

If fewer than 10 neighborhoods have data, write one page per
neighborhood that does.

`title`: human one-liner, e.g. `"Mission · 1,204 incidents/90d · 18%
cleared · ▲22% vs prior 30d"`.

`compiled_truth` (markdown body, what `kg/data.ts` shows): summary line,
window counts table, top-5 category mix, clearance breakdown; rollup &
disparity pages carry the full table + the §3 caption.

`frontmatter` (jsonb, exact shape of seeded baselines):
```json
{
  "kind": "baseline",                 // "pattern" for the disparity page
  "meta": {},
  "source": "datasf",
  "samples": <total incident count>,
  "legacy_id": "datasf-baseline-sf-<nbhd-slug>",  // deterministic → stable KG node id
  "confidence": 1.0,                  // real filed-report data
  "created_at": "<iso>",
  "related_gang_id": null,
  "related_incident_id": null
}
```

`tags` (child `tags(page_id, tag)` rows): `baseline:<nbhd-slug>`,
`feed:datasf_sfpd_incidents`, `source:datasf` (disparity page also
`trend:neighborhood-disparity`). `search_vector` auto-populates via the
pages trigger → searchable through `gbrain_search` and rendered by the
KG with no extra work.

## 5. Idempotency

Distinct slug namespace `baseline-datasf-…` / `pattern-datasf-…` never
collides with the 10 hand-seeded `baseline-<hex32>` pages — both coexist.
Upsert keyed on the verified unique constraint
`pages_source_slug_key UNIQUE (source_id, slug)`:
`INSERT … ON CONFLICT (source_id, slug) DO UPDATE SET title, type,
compiled_truth, frontmatter, updated_at`. After upsert, `RETURNING id`,
then `DELETE FROM tags WHERE page_id = $id` and re-insert that page's
tags (so a refresh fully replaces stale tags). Whole refresh wrapped per
page; re-running is a deterministic refresh, not duplication.

## 6. Error handling

- Zero datasf rows in `signal_events` → log `"no datasf rows — run
  pnpm --filter @caltrans/ingestion datasf --backfill first"` and exit 0
  (expected state, not an error).
- Per-page write in its own try/catch; one failed page logs and the rest
  continue (mirrors the other producers' resilience).
- DB/connection failure → structured `log.error` + exit 1. No silent
  catches. `dbFromEnv()` already gives a clear message if `DATABASE_URL`
  is missing.

## 7. Testing

`metrics.ts` and `pages.ts` are pure → high-coverage vitest with a
fixture incident set: window boundary math, 30d-vs-30d trend, resolution
bucketing, category top-5, disparity ranking/spread, and deterministic
slug/title/markdown/frontmatter/tags output. `gbrain-writer.ts`/`run.ts`
are thin IO — validated by `pnpm typecheck` + a manual live run
(`baseline`, then confirm pages via `gbrain_search` and the KG), the same
bar applied to the other producers' IO shells. No live network/DB in tests.

## 8. Scope boundary (YAGNI)

**In:** the one-shot rollup above.
**Out:** scheduling/cron; embeddings/`content_chunks` (UI uses FTS);
the real TRD response/stop equity ratios (absent data — documented as a
follow-up needing a dispatch/stop source); any UI changes (the KG
already renders `baseline`/`pattern` pages).

## 9. Open dependency / risk

None blocking. Verified live: same-DB GBrain, FTS trigger auto-populates
`search_vector`, exact `pages`/`tags` schema, `(source_id, slug)` upsert
key. The only soft assumption: SF `analysis_neighborhood` values are
clean enough to rank — handled by an "Unknown" bucket excluded from
ranked pages.
