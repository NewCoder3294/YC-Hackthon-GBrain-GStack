# GBrain handoff (for OpenClaw worker)

WatchDog now runs against a **real** GBrain installed in our Supabase project — same `pages`, `tags`, `content_chunks`, `links` schema the GBrain CLI/SDK/MCP server expects. No proxy.

## Connection string

```
GBRAIN_DATABASE_URL=postgresql://postgres.stfxqaocnyhkumapmbjw:YCHackathon@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

This is the **Supabase pooler** (PgBouncer transaction mode, port 6543). It works with GBrain because GBrain uses `pg` with prepared statements disabled when it sees pooler credentials.

## Connect OpenClaw to it

From the OpenClaw worker side:

```bash
export GBRAIN_DATABASE_URL=postgresql://postgres.stfxqaocnyhkumapmbjw:YCHackathon@aws-1-us-east-1.pooler.supabase.com:6543/postgres

# Point an SDK / CLI / MCP at the same brain
gbrain init --supabase --url "$GBRAIN_DATABASE_URL"
gbrain put-page <slug> --source watchdog --type pattern < your.md
gbrain query "tenderloin enforcement" --source watchdog
gbrain serve   # MCP stdio — wire into your worker's tool list
```

## Source convention

All WatchDog-curated intel lives under `source_id = 'watchdog'`. The `default` source is reserved for cross-tenant use. When you write pages from OpenClaw, set `--source watchdog` (or `source_id: 'watchdog'` via the SDK) so they show up in the KG.

## What's already there

- 34 pages (patterns, baselines, intel notes, reviewed incidents) seeded from SF crime research
- 94 tag rows
- Postgres FTS active (title=A, body=B, timeline=C)
- pgvector + HNSW index on `content_chunks.embedding` — embeddings ingestion is wired but not yet populated; the WatchDog UI uses FTS for now
- Two RPCs the UI calls:
  - `gbrain_search(q text, match_limit int, kinds text[])` → ranked hits
  - `gbrain_prior_context(incident_uuid uuid, match_limit int)` → relevant prior pages for an incident

## Realtime

`public.pages` is in the `supabase_realtime` publication, so any `put-page` from OpenClaw will fire `postgres_changes` events and the KG will redraw on the dispatcher side without a page reload.
