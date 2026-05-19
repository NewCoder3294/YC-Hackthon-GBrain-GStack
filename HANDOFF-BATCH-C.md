# Batch C — Map UX & interaction — HANDOFF

Branch: `feat/batch-c-map-ux`
Status: **scaffolds landed, integration into `sf-map.tsx` deferred until Batches A/B expose their data props.**

## What landed (commit `fecfc66`)

Seven new self-contained files. None of them have been wired into the live
`/map` page yet; the existing `sf-map.tsx` is untouched. This was deliberate:
the brief says to wait for Batches A and B to expose their "data props" patches
before refactoring the map component tree. Landing the foundation in isolation
lets us typecheck each piece independently and avoids merge conflicts with the
sibling batches.

### Files

| Path | Purpose |
|---|---|
| `apps/web/lib/map/state.ts` | URL ↔ filter-state encoder. Canonical: identical views produce identical URLs. Schema: `z` zoom, `c` center, `t` time offset (`-Nh`), `L` hidden layers, `p` polygon, `i` selected incident, `h` heatmap flag. |
| `apps/web/components/map/time-scrubber.tsx` | `-24h → now` slider. Pure UI; parent owns the offset state. |
| `apps/web/components/map/layer-toggles.tsx` | Left-rail layer panel. Takes `LayerSpec[] { id, label, count }` + a hidden `Set<LayerId>`. Heatmap toggle included. |
| `apps/web/components/map/incident-detail-sheet.tsx` | Sliding right sheet (`translate-x-0/full`), not modal. Closes on Esc. Renders source link, raw payload (collapsed), nearest 3 cameras with "jump to feed" buttons, nearest prior incidents within 24h. Parent supplies all three lists. |
| `apps/web/components/map/permalink.tsx` | "Copy permalink" pill button. Uses `clipboard.writeText` with a `document.execCommand('copy')` fallback. |
| `apps/web/components/map/clustering.ts` | Thin `supercluster` wrapper. `buildClusterIndex(fc, { radius, maxZoom })` → `{ getClusters, getLeaves }`. Exports `PIN_ZOOM_THRESHOLD = 13` and `isPinZoom(zoom)`. |
| `apps/web/components/map/polygon-draw.tsx` | Lasso button + live aggregation panel. Lazy-loads `@mapbox/mapbox-gl-draw`; gracefully degrades to "lasso unavailable" message if the dep is missing. Parent owns point-in-polygon math + aggregations. |

### New client deps

```
"supercluster": "^X.Y.Z"
"@mapbox/mapbox-gl-draw": "^X.Y.Z"   (loaded lazily inside polygon-draw.tsx)
"-D @types/supercluster"
"-D @types/mapbox__mapbox-gl-draw"
```

Both installed via `pnpm --filter web add`. Lockfile and `package.json` are in
the same commit. **No `node_modules` should need rebuilding on other workspaces
besides `web`.**

## What's NOT done yet

| Deliverable | Status | Reason |
|---|---|---|
| 1. Time scrubber | UI scaffolded | Not wired into map filter pipeline |
| 2. Click-to-detail incident card | UI scaffolded | Map click handlers + nearest-camera math not wired in `sf-map.tsx` |
| 3. Polygon draw tool | UI scaffolded + dep installed | Map binding not wired; parent point-in-polygon aggregator not written |
| 4. Layer toggles + cardinality | UI scaffolded | Replacing the existing top filter strip in `sf-map.tsx` requires rewriting state ownership — pending Batches A/B prop contract |
| 5. Clustering + heatmap | Helper landed | Switching `sf-map.tsx` source rendering to use `getClusters()` + a MapLibre heatmap layer is the main integration task |
| 6. Permalink | Button scaffolded | URL ↔ state sync (`useSearchParams` + `router.replace` debounced) needs to live in `sf-map.tsx` or a parent client component |
| 7. Camera-incident linkage | Not started | Needs incident → 3-nearest-cameras computation + a halo layer in MapLibre |

The brief explicitly authorizes a "stub data harness for local development"
if A/B aren't landed. **That harness has not been written** — the existing
`wdIncidents` fixture in `sf-map.tsx` covers the demo data, so the next
session can either (a) integrate against the real A/B props once they land,
or (b) reuse fixtures behind a feature flag for local-only iteration.

## How to interact with the scaffolds

The components are pure UI with prop-only state. To prototype any one of them
in isolation, drop the JSX into the `/map` page above or beside the existing
`<SFMap>`:

```tsx
import { TimeScrubber } from "@/components/map/time-scrubber";
import { LayerToggles } from "@/components/map/layer-toggles";
import { Permalink } from "@/components/map/permalink";
import {
  DEFAULT_STATE,
  type MapState,
  decodeMapState,
} from "@/lib/map/state";

// inside a client component
const [state, setState] = useState<MapState>(DEFAULT_STATE);

<TimeScrubber
  value={state.timeOffsetHours}
  onChange={(h) => setState((s) => ({ ...s, timeOffsetHours: h }))}
/>

<LayerToggles
  layers={[
    { id: "cameras", label: "cameras", count: cameras.length },
    { id: "news", label: "news", count: news.length },
    { id: "live", label: "live incidents", count: live.length },
    { id: "fixtures", label: "fixtures", count: fixtures.length },
  ]}
  hidden={state.hiddenLayers}
  onToggle={(id) =>
    setState((s) => {
      const next = new Set(s.hiddenLayers);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...s, hiddenLayers: next };
    })
  }
  heatmap={state.heatmap}
  onHeatmapToggle={() => setState((s) => ({ ...s, heatmap: !s.heatmap }))}
/>

<Permalink state={state} />
```

Polygon tool:

```tsx
import { PolygonDraw, type PolygonAggregations } from "@/components/map/polygon-draw";

<PolygonDraw
  map={mapInstance}
  active={lassoMode}
  onActiveChange={setLassoMode}
  polygon={state.polygon}
  onPolygonChange={(p) => setState((s) => ({ ...s, polygon: p }))}
  aggregations={lassoAggregations}
/>
```

Clustering:

```ts
import { buildClusterIndex, toFeatureCollection, isPinZoom } from "@/components/map/clustering";

const fc = toFeatureCollection(allPoints);
const idx = buildClusterIndex(fc);
const clusters = idx.getClusters(map.getBounds().toArray().flat() as [number,number,number,number], map.getZoom());
```

## Coordination notes

- Branch `feat/batch-b-env` may have a duplicate copy of the scaffold commit
  (`2049c90`). Left intentionally; that's where the initial commit landed
  before being cherry-picked here. If Batch B doesn't want the dupe, drop
  via revert or a clean rebase before merge.
- `sf-map.tsx` (845 lines, owned by Batch C) has **not** been modified on
  this branch. Once Batches A/B land their prop extensions to `<SFMap>`,
  the heavy refactor begins.

## Next session pickup

1. Pull Batches A and B branches; rebase `feat/batch-c-map-ux` onto whichever
   merges first.
2. Refactor `sf-map.tsx`:
   - Lift filter state into `useState<MapState>(decodeMapState(searchParams))`
   - Replace the legacy top filter strip with `<LayerToggles>` (left rail)
   - Add `<TimeScrubber>` (bottom), `<Permalink>` (top-right), `<PolygonDraw>` (left rail under toggles)
   - Replace per-layer GeoJSON sources with one source per kind backed by
     `buildClusterIndex`; toggle to MapLibre `heatmap` layer when `state.heatmap`
   - Wire `map.on("click", ...)` to build a `DetailSubject` and feed `<IncidentDetailSheet>`
   - Compute nearest-3-cameras + nearest-prior-incidents per click (haversine)
   - Render camera "halo" layer keyed off `selectedIncidentId`
3. Add a `useEffect` that calls `router.replace(buildPermalink(state))`
   debounced ~300 ms.
4. Acceptance test: copy URL from one tab, paste in incognito, confirm
   identical view (zoom, center, time window, hidden layers, polygon,
   selected incident).
5. `pnpm --filter web exec tsc --noEmit` must exit 0.
