# Knowledge Graph — Overview + Detail Redesign

**Date:** 2026-05-16
**Status:** Approved design, pending implementation plan
**Owner:** Hari
**Surface:** `apps/web/app/(app)/kg` + `apps/web/components/kg`

## Problem

The Knowledge Graph page renders the entire graph (~2000 nodes: gangs,
members, territories, arrests, incidents, alerts, decisions, dispatch,
patterns, baselines, locations) into a single React Flow canvas, positioned
by a 450-iteration Fruchterman-Reingold force simulation that runs
synchronously on the main thread on every mount **and on every Supabase
realtime event** (via `router.refresh()`).

Observed result (confirmed from a live screenshot): a hairball — serpentine
bezier edges, a hub-and-spoke "Fused incident — N signals" explosion,
orphan nodes flung into large empty whitespace by repulsion with weak
gravity, a tangled central spine with no visual hierarchy, and a full
reshuffle every time live data lands (the user loses their place).

The user's words: *"I don't care about the colors. I just don't like how
messy it is."* This is a **structure** problem, not a styling problem.

## Research Conclusion

Production knowledge-graph UIs (Neo4j Bloom, Linkurious, GitHub dependency
graph, Datadog/Vercel service maps, Obsidian at depth limit) never render
the whole graph. They use: (1) don't-draw-everything / expand-on-demand,
(2) aggregate dense regions into collapsible cluster nodes, (3) deterministic
structured layouts instead of physics, (4) visual hierarchy by importance.
Sources: Cambridge Intelligence "Fixing Data Hairballs", arXiv 2304.01311,
Tom Sawyer best-practices, React Flow layouting docs.

## Chosen Direction

**Option C — Overview + Detail**, two tiers, monochrome retained (color is
explicitly out of scope). Cluster axis: **neighborhood** (spatial backbone)
with a **gang lens** toggle. Overview shape: **geographic anchor**.

### Tier 1 — Overview (default view)

A geographic map of SF neighborhood cluster bubbles.

- **Taxonomy & centroids:** reuse `apps/web/lib/dispatch-hotspots.ts`
  `SF_HOTSPOTS` (20 neighborhoods: `name`, `district`, `lat`, `lng`,
  `weight`). This is the canonical source — no new taxonomy invented, no
  dependency on the ingestion free-string neighborhood field.
- **Node → neighborhood resolver** (`neighborhoodForNode`), priority chain:
  1. `incident` → camera location lat/lng → nearest hotspot centroid.
  2. `territory` → `center_lat/center_lng` → nearest hotspot.
  3. `gang` → modal neighborhood of its territories.
  4. `member` → its gang's neighborhood, else `last_seen_location` → nearest.
  5. `arrest` → its member's neighborhood.
  6. `alert` / `decision` → its related incident's neighborhood.
  7. `baseline` / `pattern` (GBrain) → the page's DataSF neighborhood string,
     matched to a hotspot by case-insensitive name/slug; else nearest by any
     related entity.
  8. `dispatch` / `event` → location → nearest hotspot.
  9. Fallback: nearest centroid to any known coordinate, else `Unmapped`
     (rendered as a single off-map bucket bubble, never hidden silently).
- **Projection:** `projectToViewport(lat, lng)` — linear projection of the
  SF bounding box (derived from `SF_HOTSPOTS` min/max) into the React Flow
  coordinate space. Computed once, O(n). A faint static SF landmass path is
  drawn as a background SVG for orientation. No map tiles, no MapLibre.
- **Encoding (monochrome only):** bubble diameter ∝ incident volume in that
  neighborhood; border weight ∝ max incident severity; a `⚑N` badge = count
  of unacknowledged alerts; a live pip flashes on recent activity.
- **Inter-cluster edges:** an aggregated arc between neighborhoods A and B
  when a gang operates across both (territory/membership/suspect spans A and
  B) or a rival-intrusion event/alert crosses the boundary. Edge width ∝
  count. Rendered only above a minimum-count threshold so the overview stays
  sparse. Routed as gentle arcs, not beziers.
- **Gang lens:** a toggle + gang selector. Highlights neighborhoods and arcs
  touching the selected gang and dims the rest. It is a **filter/highlight
  over the same fixed positions** — not a re-layout. Nodes never move.

### Tier 2 — Detail (drill-in)

Clicking a neighborhood bubble drills the canvas into that neighborhood with
a breadcrumb (`SF ▸ Bayview  ‹ back`). Returning to the overview is via the
back affordance or the breadcrumb root only. Clicking empty pane space
*within* detail deselects the current node (today's `onPaneClick`
behavior) — it does **not** navigate back, to avoid accidental exits.

- **Content = the neighborhood spine only.** The spine is defined as: every
  gang active in the neighborhood, every open/unacknowledged alert, every
  decision, and the N most-recent incidents (N is a single constant set in
  the implementation plan, default 8). Every other node for that
  neighborhood is collapsed by kind into a single stub node, e.g.
  `+18 incidents ⊕`, `+9 members ⊕`.
- **Expansion:** clicking a `+N ⊕` stub expands that group in place; clicking
  a regular node expands its direct links (reuses the existing
  `computeNeighborhood` logic from `kg-graph.tsx`).
- **Inspection:** clicking a node opens the existing `KgInspector` with its
  `DecisionPanel` / `IntelNotePanel` / `AckButton` sub-panels — unchanged.
- **Layout:** a deterministic radial around the neighborhood spine. The
  visible set is always < ~30 nodes, so it is always clean. No physics, no
  force simulation.

### Motion, Realtime, and the Jank Fix

- The 450-iteration synchronous force simulation in `kg-graph.tsx`
  (`layoutPositions`) is **deleted**.
- Overview positions = geographic projection, computed once, memoized.
- Detail positions = deterministic radial over a bounded set, memoized per
  open neighborhood.
- Realtime: replace the `router.refresh()`-on-every-event behavior. A live
  DB change tweens the affected neighborhood bubble's count/size and flashes
  its live pip. Detail re-lays-out **only** if its neighborhood is currently
  open *and* its node set actually changed. New nodes fade/scale in. The
  user never loses their place; nothing reshuffles.
- Edges: routed smoothstep in detail, weighted arcs in overview. The default
  serpentine bezier is removed.

## Architecture

`kg-graph.tsx` is currently a 528-line monolith (layout + filtering + focus
+ trace + render + provider). Split by responsibility (project rule:
small, single-purpose files):

| File | Responsibility | Kind |
|---|---|---|
| `apps/web/lib/kg/neighborhoods.ts` | `SF_HOTSPOTS`-backed taxonomy, `neighborhoodForNode()`, `projectToViewport()`, `nearestHotspot()` | New, pure |
| `apps/web/lib/kg/aggregate.ts` | `buildOverview(nodes,edges)` → clusters + inter-cluster edges; `buildDetail(neighborhood,nodes,edges)` → spine + `+N` stubs | New, pure |
| `apps/web/components/kg/overview-map.tsx` | Tier-1 React Flow surface: fixed projected positions, neighborhood nodes, weighted arcs, gang-lens highlight | New |
| `apps/web/components/kg/neighborhood-detail.tsx` | Tier-2: bounded subgraph, deterministic radial, stub/node expansion | New |
| `apps/web/components/kg/kg-graph.tsx` | Slimmed orchestrator: view state (overview ⇄ detail), breadcrumb, search, realtime hook, `ReactFlowProvider`. Target ~150 lines | Rewritten |
| `apps/web/app/(app)/kg/data.ts` | Extend each `KgNode` with a derived `neighborhood` server-side so the client aggregates without re-querying | Changed |
| `apps/web/components/kg/types.ts` | Add `NeighborhoodCluster`, `ClusterEdge`, view-state types | Changed |

**Reused unchanged:** `kg-node.tsx`, `kg-inspector.tsx`, `decision-panel.tsx`,
`intel-note-panel.tsx`, `ack-button.tsx`, `gbrain-query-panel.tsx`.

**Adapted:** `kg-toolbar.tsx` — search scopes to the current tier; per-kind
filters move into the detail view. `realtime-refresh.tsx` — reworked from a
`router.refresh()` trigger into a delta hook that updates counts in place.

## Data Flow

1. Server (`data.ts`, `force-dynamic`): load tables → build `KgNode[]` /
   `KgEdge[]` (as today) → annotate each node with `neighborhood` via the
   resolver → pass to `<KgGraph>`.
2. Client `KgGraph`: `buildOverview` once → render `<OverviewMap>` by
   default. View state is `{ mode: 'overview' } | { mode: 'detail',
   neighborhood }`.
3. Drill-in: set detail mode → `buildDetail` for that neighborhood →
   `<NeighborhoodDetail>`. Breadcrumb back resets to overview.
4. Realtime delta hook: on a watched-table change, recompute only the
   affected neighborhood's aggregate counts and tween them; recompute detail
   layout only if that neighborhood is open and its node set changed.

## Testing (TDD — tests written first, per project rules)

- **Unit (pure, target 80%+):**
  - `neighborhoodForNode` — each priority-chain branch + `Unmapped` fallback.
  - `nearestHotspot` / `projectToViewport` — known coordinates map to the
    expected hotspot and stay within the viewport box; projection is stable.
  - `buildOverview` — neighborhood counts, severity rollup, `⚑` alert count,
    inter-cluster edge generation and the min-count threshold.
  - `buildDetail` — spine selection, `+N` stub thresholds, expand semantics.
- **Interaction:**
  - Overview renders the deterministic bubble set; positions are byte-stable
    across re-render.
  - Clicking a bubble drills in; breadcrumb returns to overview.
  - Gang lens highlights/dims without moving any node.
  - A simulated realtime delta updates a neighborhood count while every
    bubble position remains unchanged.

## Scope

**Must-have (this effort):** overview geographic map; drill-in detail;
aggregation stubs; deletion of the force simulation; calm realtime delta
updates; preserved `KgInspector` + decision/intel/ack flow; routed edges.

**Deferred (explicitly not in first cut):** gang lens as a full re-layout
(ship highlight/dim filter instead); animated edge particles; semantic-zoom
tween between tiers; edge-label de-cluttering polish; `Unmapped` bucket
drill-in beyond a flat list.

## Non-Goals

- No color system / palette change (monochrome retained).
- No MapLibre / map tiles (static projected SVG only).
- No change to the underlying Supabase queries or GBrain integration.
- No change to `/wall`, `/map`, `/incidents` surfaces.
