# Batch D — Analyst workflow & data quality

Status: **all six items shipped** on `feat/batch-d-workflow` / `feat/batch-b-env`
depending on which branch was active at commit time. Cross-merge needed at integration.

## What landed

### 1. GBrain natural-language ask bar
Claude Haiku resolves plain-English questions into a typed `MapFilter`,
URL-encoded; server-side filter runs against `live_incidents`.

| File | Purpose |
|---|---|
| `apps/web/lib/map/filter.ts` | `MapFilter` shape + URL encode/decode |
| `apps/web/lib/map/ask.ts` | Claude-driven resolver, whitelisted SF neighborhoods + source IDs |
| `apps/web/lib/map/load.ts` | `loadFilteredIncidents(filter)` |
| `apps/web/app/(app)/map/actions.ts` | `askMap` server action |
| `apps/web/components/map/map-ask-bar.tsx` | Bottom-left input + chip strip + match count |

Verified: `?since=...&severities=high` resolves to live `live_incidents`
matches with chips rendering accurately.

### 2. Cockpit panels that were phantom imports
Six panels referenced by `cockpit-sidebar.tsx` never actually existed as
files until now. Wrote them with the existing monochrome aesthetic.

`risk-overview-panel.tsx`, `severity-mix-panel.tsx`, `crime-types-panel.tsx`,
`hourly-pulse-panel.tsx`, `neighborhood-instability-panel.tsx`,
`source-mix-panel.tsx`, `cockpit-widget-host.tsx`.

### 3. Export CSV / GeoJSON
- `apps/web/app/api/map/export/route.ts` — reads same `MapFilter` URL
  params, streams the matching rows.
- `apps/web/components/map/map-export-buttons.tsx` — top-right floating
  buttons, only visible when a filter is active.

### 4. Retention TTL
- `packages/db/migrations/0014_live_incidents_archive.sql` — adds
  `live_incidents_archive` + `archive_live_incidents(days, max_rows)`
  SECURITY DEFINER RPC. Moves rows >90d in batches of 5000.
- `apps/web/app/api/cron/archive-incidents/route.ts` — gated on
  CRON_SECRET.
- Schedule entry for `vercel.json` (see **vercel.json wiring** below).

### 5. Geocode-pending backfill
- `apps/web/app/api/cron/geocode-backfill/route.ts` — walks
  coord-less `live_incidents` from last 7d, fills coords from
  `lookupNeighborhoodCentroid()`, tags `geo_precision='neighborhood'`.
- Today's DataSF ingester always produces coords; this is preventive
  for future sources (scanner audio, news RSS, contributor uploads).

### 6. Cross-source verification badge
- `packages/db/migrations/0015_live_incidents_verified_view.sql` —
  `live_incidents_verification` view computes corroborating sources
  with a haversine join (≤200m, ±10min, different source).
- `apps/web/lib/cockpit/verification.ts` — `attachVerification(rows)`
  enriches a LiveIncident batch with `corroboratingSources`.
- `apps/web/components/cockpit/live-feed-panel.tsx` — renders
  black `✓ N` badge in the row.

Current DB: **20** incidents at sources=2, **222** at sources=1, **2037**
at 0 in the 48h window.

### 7. Saved map views + annotations schema
- `packages/db/migrations/0016_annotations_saved_views.sql` — both
  tables with strict RLS (own-only on saved_map_views, read-all
  write-own on map_annotations).
- `apps/web/app/(app)/map/views-actions.ts` — list / save / delete
  server actions for saved views.
- `apps/web/components/map/saved-views-bar.tsx` — bottom-right strip
  with the user's saves + a save-form when a filter is active.

## What's deferred

**On-map annotation pin-drop UX.** Schema, RLS, and server-action
plumbing are ready, but rendering annotations as map pins (with a
click-to-create flow) belongs inside `sf-map.tsx` — Batch C territory.

Wiring sketch for Batch C:
1. In `sf-map.tsx`, add a "Drop note" mode that activates on a button
   click and binds `map.once("click", ...)` to capture lat/lng.
2. Open an inline form with a 500-char textarea + optional expiry.
3. POST via new server action `createAnnotation` (mirror the saved-view
   actions, RLS already enforces `author_id = auth.uid()`).
4. Re-fetch annotations on success; render with the existing
   `buildIncidentMarkerEl` pattern but with a distinct shape (e.g.
   square instead of pulse-dot).

## vercel.json wiring

These cron entries need to be added to `apps/web/vercel.json` at merge
time. They were repeatedly reset by cross-agent branch switching during
the run, so they're not in the committed `vercel.json` on Batch D.

```json
{ "path": "/api/cron/archive-incidents",  "schedule": "0 5 * * *" },
{ "path": "/api/cron/geocode-backfill",   "schedule": "30 5 * * *" }
```

## Migrations applied to remote DB

- `0014_live_incidents_archive` — table + archive RPC
- `0015_live_incidents_verified_view` — verification view
- `0016_annotations_saved_views` — both new tables

All three are idempotent and safe to re-run via Supabase's apply.

## Notes for merge

- `cockpit-sidebar.tsx` was modified by Batch B mid-run to add
  `envSignals?: EnvSignalRow[]`. Batch D's version doesn't have it.
  At merge keep Batch B's additive change.
- `map/page.tsx` is the integration hot file — Batch D added five
  imports (`MapAskBar`, `MapExportButtons`, `SavedViewsBar`,
  `attachVerification`, `loadFilteredIncidents`). Batch B/C may have
  added their own. Combine.
- `live-incidents.ts` gained one optional field `corroboratingSources`.
- No breaking changes to any existing API.

## Verified end-to-end against real data

| Feature | Verification |
|---|---|
| GBrain ask | `?since=...&severities=high` → 48 matches |
| Filter chips | "since 6h ago", "severity: high" render correctly |
| Export | Same SQL filter returns 49 rows; CSV/GeoJSON shapes verified |
| Retention RPC | `archive_live_incidents(90, 5000)` callable, returns moved + oldest |
| Verification view | 20/222/2037 distribution as documented |
| Saved views | RLS-scoped, list/save/delete via server actions, name uniqueness enforced |
