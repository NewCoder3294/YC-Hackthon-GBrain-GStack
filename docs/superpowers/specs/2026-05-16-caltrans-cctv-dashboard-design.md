# CalTrans CCTV Dashboard — Design

**Date:** 2026-05-16
**Status:** Approved, ready for plan

## Purpose

A traffic-ops dashboard for CalTrans District 4 (Bay Area) CCTV. Two primary jobs:

1. **Monitor live feeds** — grid-wall view across many cameras at once.
2. **Capture incident clips** — rolling client-side buffer lets the operator retroactively clip the last N seconds of any on-screen feed and save it to a searchable archive.

Scope at launch: D4 only (~400 cameras). Single-tenant. Built to scale to all 12 CalTrans districts later.

## Constraints

- Pure black-and-white aesthetic in light mode. No hue, ever — status communicated through icon, weight, and motion.
- shadcn/ui as the primitive layer; 21st.dev for richer composites.
- No always-on ingest infrastructure at launch — buffering happens in the browser for streams the user has on screen.

## Architecture

### Stack

| Layer | Choice |
|---|---|
| App framework | Next.js 15 (App Router), deployed to Vercel |
| UI | shadcn/ui + 21st.dev, Tailwind v4 |
| Database | Supabase Postgres |
| Object storage | Supabase Storage (clip blobs + thumbnails) |
| Auth | Supabase Auth (single-tenant, email/password to start) |
| Video | `hls.js` for HLS, native `<img>` refresh loop for MJPEG |
| Map | MapLibre GL with desaturated OSM tiles |
| Catalog sync | Vercel Cron → CalTrans D4 GeoJSON endpoint, nightly |
| Schema/migrations | Drizzle |

### Rolling Buffer (client-side)

For each visible `<video>` element:

```
HTMLVideoElement
  → captureStream()
  → MediaRecorder (1s chunks, vp9/opus webm)
  → IndexedDB ring buffer (keep last 5 minutes per camera)
```

"Clip last 30s/60s/2m" actions:

1. Pull chunks from IndexedDB.
2. Concatenate into a single Blob.
3. Generate a thumbnail (canvas snapshot of first frame).
4. Upload Blob + thumbnail to Supabase Storage.
5. Insert `clips` row, optionally attach to an `incident`.

For MJPEG cameras (no `captureStream`), the buffer captures snapshots into a circular array and stitches a webm via `MediaRecorder` over an offscreen canvas.

Buffer activates only for cameras currently mounted in the DOM. Unmount = teardown.

### Repo Layout

```
/apps/web        Next.js app (frontend + API routes)
/packages/db     Drizzle schema + migrations + typed client
/packages/sync   CalTrans catalog sync job (Vercel cron entry)
```

## Data Model

```sql
cameras (
  id uuid pk,
  caltrans_id text unique,
  district int,             -- 4 at launch
  route text,               -- "I-880", "US-101"
  direction text,           -- "N", "S", "E", "W"
  mile_marker numeric,
  description text,         -- "I-880 N @ 23rd Ave"
  lat double precision,
  lng double precision,
  stream_url text,
  stream_type text,         -- "hls" | "mjpeg"
  is_active boolean,
  last_synced_at timestamptz
)

incidents (
  id uuid pk,
  title text,
  notes text,
  severity text,            -- "low" | "med" | "high"
  created_at timestamptz,
  created_by uuid           -- auth.users
)

clips (
  id uuid pk,
  incident_id uuid null fk -> incidents,
  camera_id uuid fk -> cameras,
  started_at timestamptz,
  duration_s int,
  storage_path text,
  thumbnail_path text,
  created_at timestamptz
)

clip_tags (
  clip_id uuid fk -> clips,
  tag text,
  primary key (clip_id, tag)
)

user_camera_pins (
  user_id uuid fk -> auth.users,
  camera_id uuid fk -> cameras,
  position int,
  layout_name text,         -- supports named wall layouts
  primary key (user_id, camera_id, layout_name)
)
```

RLS: pins scoped per `user_id`; incidents/clips/cameras readable by any authenticated user; writes on incidents/clips require auth.

## Screens

### 1. Live Wall — `/`

- Grid size toggle: 2×2 / 3×3 / 4×4 / 5×5.
- Top bar: grid toggle, command palette trigger (`⌘K`), filter chips (route, sub-area, status), layout selector ("Default", saved layouts).
- Per-tile:
  - Live feed with timestamp + route badge overlay (top-left).
  - REC dot (top-right) when buffer is active.
  - Hover toolbar (bottom): `Clip 30s` · `Clip 60s` · `Clip 2m` · `Snapshot` · `Pin` · `Mute` · `Fullscreen`.
  - Tile click → detail modal with larger player + buffer scrubber.
- Drag-reorder tiles. Save layout button.

### 2. Map — `/map`

- MapLibre with desaturated OSM tiles (CSS `filter: grayscale(100%)` applied to canvas).
- Cam pins clustered at low zoom.
- Click pin → right side sheet with mini preview + "Add to wall."
- Lasso/box-select → "Add N cameras to wall."
- Bottom drawer: current wall composition (drag from map to wall slot).

### 3. Incidents — `/incidents`

- Data table (shadcn `<DataTable>`): thumbnail · camera · route · timestamp · duration · tags · severity · notes preview.
- Row click → `/incidents/[id]` detail: clip player, edit tags/notes/severity, download original webm, "extend forward 30s" (re-clip from live buffer if camera is still mounted somewhere).
- Filters: date range, route, tag, severity.

### Global

- `⌘K` command palette: search cameras by route/cross-street, jump-to camera, jump-to incident, switch layout.
- Keyboard shortcuts: `g w` wall, `g m` map, `g i` incidents, `1–4` grid size, `c` clip 30s on focused tile, `f` fullscreen.

## Aesthetic Spec

- Background `#FFFFFF`, foreground `#000`.
- Neutral ramp: `#FAFAFA`, `#F0F0F0`, `#D4D4D4`, `#737373`, `#404040`.
- Typography: **Geist Sans** for UI, **Geist Mono** for timestamps, route codes, and any numeric data.
- 1px hairline borders (`#E5E5E5`).
- Border radius: 4px.
- No shadows except a single 1px elevation on floating overlays.
- REC indicator: solid black dot, opacity blink (no color).
- Charts (future heatmaps): grayscale ramp only.

## Non-goals at launch

- Multi-tenant. Single team to start; team-level scoping is future work.
- ML on feeds (vehicle detection, license plates) — explicit non-goal.
- Always-on ingest of all 400 cameras — client-side buffering is the launch design.
- Public-facing read-only view — auth-gated only.

## Phase Plan

| Phase | Scope | Parallelizable after |
|---|---|---|
| **P1 — Foundation** | Repo scaffold, Supabase project, Drizzle schema + migrations, CalTrans D4 catalog sync (cron), auth, design tokens, app shell | — |
| **P2 — Live Wall** | Grid view, HLS + MJPEG players, command palette, filter chips, layout save/load | P1 |
| **P3 — Buffer + Clipping** | MediaRecorder rolling buffer, IndexedDB ring storage, clip upload to Supabase Storage, thumbnail generation | P1 (independent of P2 player UI via shared `useCameraStream` hook) |
| **P4 — Map** | MapLibre setup, desaturated tiles, pin cluster, side sheet, lasso → wall | P1 |
| **P5 — Incidents** | Data table, detail page, tag/note/severity editing, extend-forward re-clip | P1 (consumes P3 outputs but UI can be built in parallel with mock data) |
| **P6 — Polish** | Keyboard shortcuts, perf pass (decode-on-visible, intersection observer), empty/loading states, error boundaries | All others |

P2, P3, P4, P5 can each be a separate teammate after P1 lands.

## Open Questions

None blocking. Items deferred to non-goals or future phases:

- Multi-tenant team structure
- Always-on ingest for unattended cameras
- ML/CV inference on feeds
- Mobile-optimized layout (desktop-first at launch)
