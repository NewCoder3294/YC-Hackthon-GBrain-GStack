# Batch A — Ingestion Sources (HANDOFF)

Branch: `feat/batch-a-ingest`
Worktree: `/Users/nicolasdossantos/caltrans-cctv-batch-a`
Base: `main` at `2b27521`

## What shipped

Four new ingestion sources, every commit atomic with conventional prefix
and TDD-first. 70 sync-package tests passing, 5 cron-route tests passing,
sync package typechecks clean.

| Commit    | Source              | Table             | Cadence | New cron? |
|-----------|---------------------|-------------------|---------|-----------|
| `2198316` | PG&E outages        | `live_incidents`  | 10 min  | no (orchestrated) |
| `888eae5` | News RSS            | `news_incidents`  | 30 min  | yes (`/api/cron/sync-news`) |
| `be5c12b` | SFFD active         | `live_incidents`  | 2 min   | no (orchestrated) |
| `9064fec` | Scanner calls       | `live_incidents`  | 2 min   | no (orchestrated) |

The three `live_incidents` sources plug into the existing
`syncLiveIncidents` orchestrator. They run on the existing
`*/5 * * * *` cron at `/api/cron/sync-live-incidents`; each source's
freshness gate clamps it to its true cadence (so SFFD-active and
scanner each poll on the every-other tick).

News RSS gets its own cron route + orchestrator because the target
table differs.

## Files added

```
packages/sync/src/sources/pge-outages.ts          + test
packages/sync/src/sources/news-rss.ts             + test
packages/sync/src/sources/sffd-active.ts          + test
packages/sync/src/sources/scanner-calls.ts        + test
packages/sync/src/news-incidents.ts               (news upsert)
packages/sync/src/orchestrate-news.ts             (news orchestrator)
apps/web/app/api/cron/sync-news/route.ts          + test
```

## Files touched

```
packages/sync/src/orchestrate.ts                  (4 sources wired in)
packages/sync/src/orchestrate.test.ts             (4 new vi.mock stanzas)
packages/sync/src/index.ts                        (new exports)
apps/web/vercel.json                              (sync-news cron entry)
```

## Env vars

No new env vars required. All four upstreams are unauthenticated public
endpoints:

- PG&E: `https://ewx.pge.com/OMSExternal/CallCenter/getOutagesJson`
- SFFD active: `https://api.sf-fire.org/incidents/active`
- OpenMHz scanner: `https://api.openmhz.com/sfpdmac/calls/newer`
- News RSS feeds: Mission Local / SF Standard / SFist / SFPD press

`CRON_SECRET` (already in env) gates the new `/api/cron/sync-news`
route via the shared `isAuthorizedCron` helper.

## Migrations

None. Every source writes to existing tables (`live_incidents`,
`news_incidents`, `live_incident_syncs`) without schema changes.

## Cron schedules

`apps/web/vercel.json` gains one entry:

```
{ "path": "/api/cron/sync-news", "schedule": "*/30 * * * *" }
```

Existing crons unchanged. The three `live_incidents` sources ride the
existing `*/5 * * * *` `sync-live-incidents` cron.

## Tests

```
pnpm --filter @caltrans/sync test     # 70 pass (11 files)
pnpm --filter web test sync-news      # 5 pass
pnpm --filter @caltrans/sync typecheck  # clean
```

Cron route uses `vi.hoisted` per global conventions
(see `apps/web/app/api/cron/sync-news/route.test.ts`).

`pnpm --filter web typecheck` reports pre-existing errors in
`components/cockpit/cockpit-sidebar.tsx` that reference panel files
which only exist on `feat/batch-d-workflow` (commit `d83fd85`). Not
caused by Batch A; will resolve when Batch D merges.

## Agent C caveats

I never touched any of Agent C's files. The Batch C untracked diffs
(`apps/web/app/(app)/map/actions.ts`, `apps/web/components/map/map-ask-bar.tsx`,
`apps/web/lib/map/...`) sit on `feat/batch-c-map-ux` and were avoided by
working in a separate worktree from `main` at `/Users/nicolasdossantos/caltrans-cctv-batch-a`.

No shared files (`vercel.json`, `map/page.tsx`, `sf-map.tsx`) were
touched in conflict with Batch C — only `vercel.json` was modified, and
the change is purely additive (a new cron entry at the end of the
array). When Batch C and Batch A both land, the merge resolution is
trivial: keep both `crons` entries.

## Rollout / rollback notes

- All four sources fail-closed: orchestrator-level `Promise.allSettled`
  isolates source failures; news-rss internally uses `Promise.allSettled`
  across RSS feeds so a single broken feed does not nuke the run.
- Severity heuristics for PG&E (customer-count) and scanner (talkgroup
  string match) are documented inline and easy to tune.
- To disable an ingestor without code change: bump its
  `minIntervalMs` in `SOURCE_CONFIGS` to a value larger than the
  cron interval, or remove it from the `sources?` allowlist on the
  cron route URL (`?sources=sfpd_cad,sf_fire_ems` etc.).
- To kill the news cron: remove the `sync-news` entry from
  `apps/web/vercel.json` and redeploy.
- No data deletion path needed: dedup is by `source_url` for news
  and `(source, source_uid)` for live incidents, so a bad run will
  re-upsert in place rather than duplicate.

## Open follow-ups (not in scope)

- Scanner-calls audio URLs are persisted in `raw.url` but no
  transcription job exists yet. A Batch B/D job can fan out and call
  Whisper/Deepgram per row.
- PG&E feed shape is reverse-engineered, not contracted. If PG&E
  rotates the endpoint we'll need to update `PGE_OUTAGES_URL`.
- News-rss neighborhood matching is substring-based; long-term we
  should pair it with a proper street-address NER pass for finer geo.
