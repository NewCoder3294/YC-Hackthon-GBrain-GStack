# Signal Correlator + Incident Ranker — Design

**Date:** 2026-05-16
**Status:** Approved (design)
**Topic:** The interpretation layer that consumes `signal_events`, collapses
correlated multi-source signals into incidents, ranks them for dispatch, and
writes them to GBrain with a narrated rationale.

---

## 1. Problem & Goal

`signal_events` is the unified ingestion substrate (camera / 911 CAD / citizen /
DataSF SFPD incidents). Per the project handoff notes, **nothing consumes it
yet** — there is no correlator and no priority logic anywhere. Live dispatch
today only surfaces raw SFPD `priority` (A/B/C/E) labels with no interpretation.
The GBrain neighborhood `baseline` layer (volume windows, trend, category mix,
clearance rate, disparity proxy) exists but is unused by dispatch.

**Goal:** Build the missing "brain" — a **Signal Correlator + Incident Ranker**
that:

1. Collapses correlated multi-source signals into single incidents.
2. Ranks incidents by dispatch urgency using a transparent, deterministic score.
3. Explains each rank with a GBrain-grounded narrative.
4. Persists incidents as GBrain pages and serves a ranked triage queue.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Layer's job | Incident **correlator + ranker** (fills the missing correlator AND adds priority) |
| Correlation rule | **Hybrid**: deterministic space + time + category clustering; Claude adjudicates ambiguous merges |
| Ranking model | **Deterministic weighted score → tier**, with an **LLM-written rationale** on top |
| Score factors | source corroboration · category severity · GBrain baseline anomaly · GBrain equity weight (equity folds in recency + signal confidence) |
| Output target | **GBrain pages + API** — incident pages linked to neighborhood baseline pages; thin ranked API serves the UI |
| Signal scope | **Live window + DataSF-in-window**, dedupe-aware (a DataSF filed report of an event already seen via live 911 = corroboration, not a 4th independent source) |
| Cadence + UI | **Periodic worker** (~30–60s, mirrors `baseline/run.ts`) **+ a minimal ranked triage-queue UI** |
| Architecture | **A — mirror the proven, fully-tested `baseline/` pipeline pattern** |

## 3. Architecture

New module family `packages/ingestion/src/correlate/`, mirroring the structure
and discipline of the existing `baseline/` pipeline (75 passing tests).

| File | Kind | Responsibility |
|---|---|---|
| `types.ts` | pure | `LiveSignal`, `CandidateCluster`, `AmbiguousMerge`, `ScoredIncident`, `NeighborhoodContext`, `RankedIncident` |
| `config.ts` | pure | All named constants (no magic numbers) |
| `window.ts` | pure | Filter `signal_events` → in-scope window; normalize all 4 source payloads into one `LiveSignal`; assign neighborhood |
| `cluster.ts` | pure | Greedy space + time + category clustering → clusters + ambiguous pairs |
| `adjudicate.ts` | LLM seam | `Adjudicator` interface: `resolveAmbiguous()` + `narrate()`. Real impl = Anthropic SDK; **default stub = deterministic** |
| `score.ts` | pure | Cluster + `NeighborhoodContext` → 4-factor score → tier + factor breakdown |
| `pages.ts` | pure | Incident → `GbrainPage` (same shape discipline as `baseline/pages.ts`) |
| `gbrain-writer.ts` | IO | Upsert incident pages + links to baseline pages + tags + timeline |
| `run.ts` | IO shell | Env/DB/GBrain wiring, orchestrate, structured logging (mirrors `baseline/run.ts`) |

### Data flow

```
signal_events (live window, all sources incl. DataSF-in-window)
        │
        ▼
window.ts ──► LiveSignal[]  (normalized, neighborhood-tagged)
        │            ▲
        │            └── GBrain baseline pages → NeighborhoodContext map
        ▼
cluster.ts ──► CandidateCluster[] + AmbiguousMerge[]
        │
        ▼
adjudicate.resolveAmbiguous()  (LLM or deterministic stub) → final clusters
        │
        ▼
score.ts ──► ScoredIncident[]  (priority, tier P1–P4, factor breakdown)
        │
        ▼
adjudicate.narrate()  (LLM or templated stub) → rationale string
        │
        ▼
pages.ts ──► GbrainPage[] ──► gbrain-writer.ts ──► GBrain
                                                     │
                        app/api/incidents/ranked ◄───┘ ──► Triage Queue UI
```

## 4. Algorithms

### 4.1 Neighborhood assignment (`window.ts`)

Signals carry lat/lng but not always a neighborhood. Compute neighborhood
**centroids from the historical DataSF coordinates already present in
`signal_events`**, then assign each signal to its **nearest centroid**
(haversine). No new geo dependency. If no baseline exists for the resolved
neighborhood → `Unknown`; scoring degrades gracefully (drops anomaly/equity,
flags `degraded:true`). This approximation is an accepted, documented
limitation for the demo (point-in-polygon is explicitly deferred).

### 4.2 Correlation (`cluster.ts`)

Greedy, deterministic, order-stable: sort by `occurredAt`, tiebreak by signal
id.

- A signal joins an open cluster iff: **within `RADIUS_M`** (haversine) **AND**
  time gap to the cluster's latest signal **≤ `TIME_GAP_MIN`** **AND**
  category-compatible via `CATEGORY_AFFINITY` (normalized category → affinity
  group; e.g. 911 "shots fired" + camera "person" + citizen "gunshots" all map
  to group `weapons-violence`).
- **Ambiguous** = within radius but category mismatch, **OR** just outside
  radius (≤ `AMBIGUOUS_RADIUS_FACTOR × RADIUS_M`) but strong category match →
  deferred to `adjudicate.resolveAmbiguous()`.
- **DataSF dedupe-aware:** a `payload.feed = 'datasf_sfpd_incidents'` signal
  landing near a live `call_911` CAD signal in the same cluster is flagged as a
  *filed record of* (not an independent 4th source); feeds the scorer's
  corroboration factor at `0.5×`.

### 4.3 Scoring (`score.ts`)

| Factor | Source | Effect |
|---|---|---|
| `corroboration` | count of distinct independent sources (DataSF-dup = 0.5×) | more sources → higher |
| `severity` | `SEVERITY_MAP`: SFPD priority A/B/C/E + DataSF `incident_category` → 0–1 | violent/weapons → higher |
| `baselineAnomaly` | cluster category rate vs GBrain neighborhood baseline | spiking above baseline → boost |
| `equityWeight` | GBrain disparity (clearance percentile + under-service); folds in recency decay + mean signal confidence | under-cleared/under-served → boost |

`priority = w_corroboration·corroboration + w_severity·severity +
w_anomaly·anomaly + w_equity·equity` → `TIER_THRESHOLDS` → tier
**P1 / P2 / P3 / P4**. Weights & thresholds are named, documented constants;
the full factor breakdown is retained for the UI and the rationale.

### 4.4 Adjudicator seam (`adjudicate.ts`)

Interface with two methods, mockable in tests:

- `resolveAmbiguous(pair, context) → 'merge' | 'split'`
- `narrate(incident, factors, context) → string`

Real implementation uses the Anthropic SDK (Claude). **Default stub is
deterministic**: `resolveAmbiguous` merges only if within
`AMBIGUOUS_RADIUS_FACTOR × RADIUS_M` AND same affinity group; `narrate`
produces a templated sentence from the factor breakdown. The pipeline **never
blocks on the LLM** — missing API key / error / latency → automatic stub
fallback, logged. LLM calls are bounded: adjudication only on ambiguous pairs,
narration only on final ranked incidents.

### 4.5 GBrain output (`pages.ts` + `gbrain-writer.ts`)

- One page per incident, `type='incident'` (new page type alongside
  `baseline`/`pattern`), with a **deterministic slug derived from the sorted
  signal-id set** → re-runs upsert (idempotent), never duplicate.
- Frontmatter mirrors `baseline/pages.ts`: `kind:'incident'`,
  `source:'correlator'`, `samples` (signal count), `confidence` (mean),
  `created_at`.
- **Link** incident page → its neighborhood `baseline` page (reuse
  `slugifyNeighborhood`).
- **Tags:** `incident`, `priority:P1`, `neighborhood:<slug>`,
  `category:<x>`, per-source tags.
- **Timeline:** one entry per source signal (time, source, summary).
- Writer upserts with the same `ON CONFLICT (source_id, slug)` idiom as
  `baseline/gbrain-writer.ts`; per-page failures are collected and counted, not
  fatal.

## 5. API + UI + Cadence

- **API** `apps/web/app/api/incidents/ranked/route.ts` — `GET`, queries GBrain
  `type='incident'`, returns `{ success, data: RankedIncident[] }` sorted by
  priority↓ then recency. `RankedIncident` = `{ id, slug, priority, tier,
  neighborhood, category, sourceCount, sources, occurredSpan, lat, lng,
  rationale, factors }`. Typed error envelope on failure.
- **UI** — minimal **Triage Queue** at new route `app/(app)/triage`, reusing
  `dispatch-panel` / `event-feed` / `realtime-refresh` patterns. Ranked rows:
  tier badge · category · neighborhood · source chips · age · rationale line;
  expand → factor breakdown. Polls the API every ~15s so the queue visibly
  re-ranks as the worker runs.
- **Cadence** — canonical: worker script
  `pnpm --filter @caltrans/ingestion correlate` (mirrors `baseline`). Plus a
  thin `app/api/cron/correlate` route invoking the same pipeline for the
  deployed demo.

## 6. Configuration (named constants — `correlate/config.ts`)

| Constant | Default | Notes |
|---|---|---|
| `WINDOW_HOURS` | 48 | live correlation window |
| `RADIUS_M` | 150 | TRD ~200m proximity, tightened to reduce false merges |
| `TIME_GAP_MIN` | 20 | max gap to a cluster's latest signal |
| `AMBIGUOUS_RADIUS_FACTOR` | 1.5 | just-outside-radius + strong category → adjudicator |
| `WEIGHTS` | `{ corroboration, severity, anomaly, equity }` | tunable, documented |
| `TIER_THRESHOLDS` | P1/P2/P3/P4 cutoffs | documented |
| `SEVERITY_MAP` | SFPD A/B/C/E + DataSF category → 0–1 | |
| `CATEGORY_AFFINITY` | normalized category → affinity group | |

## 7. Error Handling — degrade, never crash

- **Bad rows:** zod-validate `signal_events` at the boundary; skip + count
  malformed rows, never throw.
- **GBrain baseline fetch fails:** run with available factors only, drop
  anomaly/equity, flag `degraded:true` in rationale.
- **LLM unavailable / no key / error:** automatic deterministic stub fallback;
  pipeline never blocks on the LLM; logged.
- **GBrain write fails per page:** collect failures, continue others, surface
  count (mirrors `baseline/gbrain-writer.ts`).
- **API:** typed `{ success:false, error }` envelope; no internal leakage.
- **Idempotency:** deterministic slug from sorted signal-id set → re-runs
  upsert, not duplicate.

## 8. Testing — TDD, test-first, ≥80%, full suite stays green

- **Pure units fully unit-tested, no IO:** `window` (filter / normalize /
  neighborhood), `cluster` (radius, time gap, category compat, ambiguous
  detection, DataSF-dup fixture, order-stability), `score` (each factor
  isolated + composite + tiers + graceful-degrade), `pages` (exact GBrain
  shape, slug determinism, links/tags/timeline), `adjudicate` stub
  (deterministic decisions + templated narrative).
- Adjudicator interface **mocked** in `cluster`/`score` tests; one contract
  test for the stub.
- `gbrain-writer` + `run` = thin IO shells, mirror `baseline`'s existing test
  depth (upsert contract + smoke).
- Mirror existing `*.test.ts` conventions; the current **75-test ingestion
  suite must stay green**.

## 9. Scope (YAGNI)

**IN:** live-window correlation (incl. DataSF-in-window, dedupe-aware) ·
4-factor deterministic score → tier · LLM rationale with deterministic
fallback · GBrain incident pages + baseline links + tags + timeline · ranked
API · minimal triage-queue UI with polling · worker script + thin cron route.

**OUT (explicitly deferred):** point-in-polygon neighborhood geocoding
(centroid approximation instead) · incremental / stateful real-time ·
unit/vehicle assignment & routing · Postgres `incidents` write-back ·
historical backfill correlation · map-pin rendering of incidents (queue UI
only) · auth / multi-tenant changes.

**Reuse:** `load-env.ts`, `db.ts`, `signal-events` schema, baseline
`slugifyNeighborhood` + GBrain upsert idiom, cron pattern,
`dispatch-panel` / `event-feed` / `realtime-refresh` UI patterns.

## 10. Risks & Mitigations

- **DataSF double-count** → dedupe-aware corroboration (0.5×) +
  ambiguous→adjudicator; flagged for tuning.
- **Centroid neighborhood approximation** → accepted for demo, documented;
  graceful `Unknown` degrade.
- **Greedy clustering order-sensitivity** → time-sorted, deterministic id
  tiebreak; documented.
- **LLM latency/cost** → adjudication only on ambiguous pairs, narration only
  on final ranked incidents; deterministic fallback always available.
