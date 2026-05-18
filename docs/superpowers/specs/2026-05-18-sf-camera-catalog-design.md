# SF camera catalog — design (Spec B)

**Status:** designing
**Date:** 2026-05-18
**Motivation:** WatchDog ships today with CalTrans D4 highway cameras
(via `packages/sync/caltrans`) and a couple of demo seeds. For
production credibility — dispatchers, design partners, pilot — the
`/wall` and `/map` need real intersection-level SF coverage, not just
the I-280 / 101 ribbon. We also need a clean separation between
"public/municipal cams" (no homeowner, no policy gate) and
"contributor cams" (homeowner-opted-in, policy enforced via
`request_camera_access`).

## What's already there
- `cameras` table with `contributor_id` (nullable). Null = no owner.
- CalTrans D4 sync (`/api/cron/sync-cameras`, daily).
- Five demo public wall-fill cameras (Mux test HLS) from seed-demo.

## Why "SFMTA scraper" is the wrong framing
There is no public SFMTA / 511.org intersection-camera feed. 511 gives
traffic *events*, not camera streams. The realistic production source
mix is:
1. CalTrans D4 (already wired) — freeway / corridor cams (~30+ in SF
   region after filter to SF bbox).
2. Hand-curated catalog — public-domain webcams at named intersections
   (Mission, Embarcadero, Castro, etc.) sourced from EarthCam,
   SFGovTV, university campus cams, Twin Peaks tower feed. Each entry
   carries a stable id, a real HLS URL, and an SF neighborhood tag.
3. Contributor cams — already supported via the OpenContribution
   bridge flow (`bridges` table + `/c/[token]/install`).

No "scraper" — instead, a TS module `packages/sync/curated-sf.ts`
that exports a typed `CuratedCamera[]` and a `syncCurated()` function
that idempotently upserts the list into `cameras`. Adding cameras
becomes a typed edit, not a JSON-config drift.

## Schema

Add `cameras.source` column to make the provenance explicit:

```sql
ALTER TABLE cameras
  ADD COLUMN source text NOT NULL DEFAULT 'caltrans'
    CHECK (source IN ('caltrans', 'curated', 'sfmta', 'contributor', 'demo'));
```

- `caltrans` — existing freeway sync. Default for legacy rows.
- `curated` — hand-curated public cams (this spec).
- `sfmta` — reserved for future automated SFMTA feed (not built).
- `contributor` — has a `contributor_id`. Two-way check: trigger or
  app-level invariant enforces `source = 'contributor' XOR
  contributor_id IS NULL` — TBD whether enforced in DB.
- `demo` — Mux test streams used by seed-demo; cleared in prod.

## Curated catalog format

`packages/sync/curated-sf.ts`:

```ts
export interface CuratedCamera {
  /** Stable slug — never changes. Used as `cameras.caltrans_id` for
   *  the upsert key (column name predates this spec). */
  slug: string;
  description: string;          // human label
  neighborhood: string;         // "mission" | "soma" | …
  lat: number;
  lng: number;
  streamUrl: string;            // HLS m3u8
  attribution: string;          // "EarthCam" | "SFGovTV" | …
  attributionUrl?: string;      // canonical page; surfaces in admin UI
}

export const CURATED_SF_CAMERAS: CuratedCamera[] = [
  // ~20 entries, geographically distributed
];
```

Sync function reuses existing upsert pattern from CalTrans:

```ts
export async function syncCuratedCameras(deps: { admin: SupabaseClient }) {
  for (const c of CURATED_SF_CAMERAS) {
    await deps.admin.from('cameras').upsert({
      caltrans_id: c.slug,
      district: 4,
      route: c.neighborhood,
      description: c.description,
      lat: c.lat, lng: c.lng,
      stream_url: c.streamUrl,
      stream_type: 'hls',
      is_active: true,
      source: 'curated',
    }, { onConflict: 'caltrans_id' });
  }
}
```

## Cron wiring

New route `/api/cron/sync-curated-cameras` — gated by `CRON_SECRET`.
Calls `syncCuratedCameras`. Daily at 03:00 UTC (off-peak with the
existing CalTrans sync at 09:00).

`apps/web/vercel.json` gets one new entry.

## Citizen audit + public-cam handling

No change to `request_camera_access` — it already short-circuits to
`legal_basis = 'public_domain'` when `contributor_id IS NULL`, and
writes the audit row. Curated cams go through the same path. The
citizen page only renders rows scoped to that contributor's cameras,
so curated-cam events stay invisible to citizen dashboards (correct).

## /wall + /map effect

Once the curated set lands, the wall renders ~50+ cameras
(CalTrans + curated) instead of ~30. Map gets pins across the city
grid, not just along freeways.

## Per-camera detail page (deferred)

Today `/live/[id]` serves a `live_incidents` detail page, NOT a
per-camera page. Production needs a per-camera surface to show the
HLS stream + audit log + policy preview + Request-access button.
That's its own follow-up (Spec D — UI: per-camera detail) since it
touches routing, header nav, and the wall tile click target.

## Plan (one-pass)

1. Migration 0011: `cameras.source` column + CHECK + index.
2. Drizzle schema regen.
3. Create `packages/sync/curated-sf.ts` with the typed list +
   `syncCuratedCameras` function.
4. Hand-pick ~20 cameras across neighborhoods (research time:
   ~30 min on EarthCam, SFGovTV, Caltrans D4 to dedupe).
5. New API route `/api/cron/sync-curated-cameras`.
6. Add cron entry to `apps/web/vercel.json`.
7. Run sync locally; verify cam count went from N to N+20 in
   `cameras` table.
8. Smoke /wall and /map: tiles render, HLS streams play.

## Risks

- HLS source rot — public webcam URLs change. The sync logs upsert
  status; an "is_active=false" follow-up should be set when a stream
  404s on next check. Out of scope for this spec; track as Spec D.5.
- Aspect / framing variance — public cams aren't all 16:9. Wall tile
  already aspect-locks; verify no overflow on landscape vs portrait.
- Attribution — public webcam embedding etiquette varies. Keep an
  attribution string per camera; surface it in the per-camera detail
  page (Spec D).

## Out of scope (Spec B+)

- Per-camera UI route (Spec D).
- Health monitoring / auto-deactivation (Spec D.5).
- SFMTA / 511 automated camera ingestion — no public feed exists.
- True real-time camera health pings.
