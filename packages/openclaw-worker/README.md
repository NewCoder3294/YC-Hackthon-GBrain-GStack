# @caltrans/openclaw-worker

The OpenClaw side of the OpenClaw ↔ WatchDog contract. Watches signals, fuses them into incidents, posts to `/api/openclaw/ingest`, and writes the brain via the schema in [`docs/GBRAIN_HANDOFF.md`](../../docs/GBRAIN_HANDOFF.md).

## Two modes

| Mode | What it does | When to use |
|---|---|---|
| `scripted` (default) | Cycles through 5 hand-authored SF scenarios on `INTERVAL_S`. Each scenario picks a real nearby camera and an existing clip so the dispatcher view plays real footage. | Demo. Safe even when `signal_events` is empty. |
| `fusion` | Reads recent `signal_events` (Hari's ingestion layer), clusters them in space (300 m) + time (90 s), emits one incident per cluster ≥ 2 distinct signals. | Real fusion — production-shaped. |
| `both` | Tries fusion first. If no cluster fired, falls back to scripted. | Hybrid demo. |

## Run

```bash
# Long-running loop (default INTERVAL_S=45)
pnpm --filter @caltrans/openclaw-worker worker

# One-shot tick (for cron, CI smoke)
pnpm --filter @caltrans/openclaw-worker tick

# Override mode/interval
WORKER_MODE=both INTERVAL_S=30 pnpm --filter @caltrans/openclaw-worker worker
```

## Required env

Reads from `apps/web/.env.local` automatically. Real shell env wins.

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (required) | Postgres pooler URL — same one WatchDog uses. |
| `CRON_SECRET` | (required) | Bearer for `/api/openclaw/ingest`. |
| `INGEST_URL` | `http://localhost:3000/api/openclaw/ingest` | Override for staging/prod. |
| `WORKER_MODE` | `scripted` | `scripted` / `fusion` / `both`. |
| `INTERVAL_S` | `45` | Poll cadence in the long-running loop. |
| `FUSION_WINDOW_S` | `90` | Spatial-temporal window. |
| `FUSION_RADIUS_M` | `300` | Cluster distance threshold. |
| `FUSION_MIN_SIGNALS` | `2` | Cluster size to fire an incident. |
| `WORKER_USER_ID` | placeholder UUID | `created_by` for emitted incidents. Override to your auth user for cleanliness. |
| `GBRAIN_PAGES_ENABLED` | `true` | Write companion `pattern` / `intel_note` pages per the handoff doc. |
| `GBRAIN_SOURCE_ID` | `watchdog` | Source tag on emitted pages. |

## What gets written

For each emitted incident (scripted or fusion):

1. **`POST /api/openclaw/ingest`** — incident + clips, validated by `route.ts`'s zod schema. Server inserts rows and fires `refresh_predictive_alerts()`.
2. **gbrain `intel_note` page** — `slug=openclaw-intel-<key>`, tagged `intel:openclaw`, `severity:<lvl>`, `signal:<kind>` ×N, optional `region:`, `gang:` tags. `related_incident_id` set so it surfaces in the dispatcher's Prior Context panel.
3. **gbrain `pattern` page** (when cam+911 signature detected) — `slug=pattern-cam-911-coincidence`, upserts in place across detections so the KG doesn't bloat.

All pages: `source_id='watchdog'` per [GBRAIN_HANDOFF.md](../../docs/GBRAIN_HANDOFF.md).

## Architecture

```
                                              ┌──────────────────────────┐
       ┌──────────────┐                       │  apps/web                │
       │ signal_events│ ── fusion ── cluster ─►  /api/openclaw/ingest    │
       │ (Hari)       │                       │  → incidents + clips     │
       └──────────────┘                       │  → refresh_predictive    │
                                              └──────────────────────────┘
                                                          │
                                                          ▼
                            ┌──────────────────────────────────────────┐
                            │ Supabase                                  │
                            │   pages (watchdog source_id)              │
                            │   tags                                    │
                            │   ↑ gbrain_search / gbrain_prior_context  │
                            │     RPCs read from here                   │
                            └──────────────────────────────────────────┘
```

## Tests

```bash
pnpm --filter @caltrans/openclaw-worker test
```

Covers: Haversine, spatial+temporal clustering, severity scoring, scenario uniqueness/coverage, round-robin scheduling. No live-DB tests — for that, run `pnpm tick` and check `pages` + `incidents` rows.

## Safety

- `runTick` catches per-emit errors so a single scenario or cluster failure doesn't kill the loop.
- Ingest client retries 5xx with backoff (2 attempts).
- gbrain page writes wrapped — if `pages` writes fail, the incident still landed; only "gbrain didn't learn from this one" is lost.
- Process-local dedupe by `fusionKey` / scenario-minute prevents duplicate emits across overlapping ticks.
- Graceful SIGINT / SIGTERM shutdown closes the postgres pool before exit.
