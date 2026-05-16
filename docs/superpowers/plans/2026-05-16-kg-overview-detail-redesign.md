# KG Overview + Detail Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single force-simulated KG hairball with a two-tier UI — a fixed geographic neighborhood overview that drills into a bounded, aggregated per-neighborhood detail graph.

**Architecture:** Server (`data.ts`) annotates every node with a `neighborhood` derived from `SF_HOTSPOTS` centroids. Pure modules (`lib/kg/neighborhoods.ts`, `lib/kg/aggregate.ts`) compute clusters and detail subgraphs. Two React Flow surfaces (`overview-map.tsx`, `neighborhood-detail.tsx`) render fixed-position bubbles and a deterministic radial detail; a slim `kg-graph.tsx` orchestrates view state and realtime. The 450-iteration force simulation is deleted.

**Tech Stack:** Next.js 15 App Router, React 19, `@xyflow/react` v12, Tailwind v4, Vitest (node env), Supabase.

**Spec:** `docs/superpowers/specs/2026-05-16-kg-overview-detail-redesign-design.md`

**Testing note:** `apps/web/vitest.config.ts` runs `environment: "node"` — React Flow components are NOT unit-testable here. Pure functions get full TDD with `.test.ts`. Components get a documented manual verification step against the running dev server (`http://localhost:3000/kg`, already running via `pnpm dev` in `apps/web`). Run all tests with: `cd apps/web && pnpm test`. Typecheck with: `cd apps/web && pnpm typecheck`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/lib/kg/neighborhoods.ts` | New, pure: hotspot taxonomy, `nearestHotspot`, `matchHotspotByName`, `projectToViewport`, `resolveNeighborhood` |
| `apps/web/lib/kg/neighborhoods.test.ts` | Unit tests for the above |
| `apps/web/lib/kg/aggregate.ts` | New, pure: `buildOverview`, `buildDetail` |
| `apps/web/lib/kg/aggregate.test.ts` | Unit tests for the above |
| `apps/web/components/kg/types.ts` | Modify: add `neighborhood` to `KgNode`, add cluster/view/stub types |
| `apps/web/app/(app)/kg/data.ts` | Modify: annotate each node with `neighborhood` before return |
| `apps/web/components/kg/overview-map.tsx` | New: Tier-1 geographic React Flow surface |
| `apps/web/components/kg/neighborhood-detail.tsx` | New: Tier-2 bounded radial subgraph |
| `apps/web/components/kg/kg-graph.tsx` | Rewrite: slim orchestrator (view state, breadcrumb, realtime) |
| `apps/web/components/kg/realtime-refresh.tsx` | Modify: keep as-is functionally (router.refresh) but scoped — see Task 9 |

---

## Task 1: Hotspot geometry primitives

**Files:**
- Create: `apps/web/lib/kg/neighborhoods.ts`
- Test: `apps/web/lib/kg/neighborhoods.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/kg/neighborhoods.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  nearestHotspot,
  matchHotspotByName,
  projectToViewport,
} from "./neighborhoods";

describe("nearestHotspot", () => {
  it("snaps exact Tenderloin centroid to Tenderloin", () => {
    expect(nearestHotspot(37.7838, -122.4144)).toBe("Tenderloin");
  });
  it("snaps a point near Bayview to Bayview Hunters Point", () => {
    expect(nearestHotspot(37.7335, -122.3893)).toBe("Bayview Hunters Point");
  });
  it("returns a known hotspot name for an arbitrary SF point", () => {
    const n = nearestHotspot(37.79, -122.41);
    expect(typeof n).toBe("string");
    expect(n.length).toBeGreaterThan(0);
  });
});

describe("matchHotspotByName", () => {
  it("matches case-insensitive substring", () => {
    expect(matchHotspotByName("the tenderloin district")).toBe("Tenderloin");
  });
  it("matches the bayview alias", () => {
    expect(matchHotspotByName("BAYVIEW")).toBe("Bayview Hunters Point");
  });
  it("returns null when nothing matches", () => {
    expect(matchHotspotByName("Atlantis")).toBeNull();
  });
});

describe("projectToViewport", () => {
  it("keeps points inside the configured box with padding", () => {
    const { x, y } = projectToViewport(37.7838, -122.4144, {
      width: 1000,
      height: 800,
      padding: 60,
    });
    expect(x).toBeGreaterThanOrEqual(60);
    expect(x).toBeLessThanOrEqual(940);
    expect(y).toBeGreaterThanOrEqual(60);
    expect(y).toBeLessThanOrEqual(740);
  });
  it("is deterministic", () => {
    const a = projectToViewport(37.76, -122.42, { width: 800, height: 600, padding: 40 });
    const b = projectToViewport(37.76, -122.42, { width: 800, height: 600, padding: 40 });
    expect(a).toEqual(b);
  });
  it("places a northern point above a southern point (lat inverted)", () => {
    const north = projectToViewport(37.80, -122.42, { width: 800, height: 600, padding: 40 });
    const south = projectToViewport(37.72, -122.42, { width: 800, height: 600, padding: 40 });
    expect(north.y).toBeLessThan(south.y);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test -- neighborhoods`
Expected: FAIL — `Cannot find module './neighborhoods'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/lib/kg/neighborhoods.ts`:

```ts
import { SF_HOTSPOTS } from "@/lib/dispatch-hotspots";

export interface ProjectOpts {
  width: number;
  height: number;
  padding: number;
}

const LAT_MIN = Math.min(...SF_HOTSPOTS.map((h) => h.lat));
const LAT_MAX = Math.max(...SF_HOTSPOTS.map((h) => h.lat));
const LNG_MIN = Math.min(...SF_HOTSPOTS.map((h) => h.lng));
const LNG_MAX = Math.max(...SF_HOTSPOTS.map((h) => h.lng));

export function nearestHotspot(lat: number, lng: number): string {
  let best = SF_HOTSPOTS[0]!;
  let bestD = Infinity;
  for (const h of SF_HOTSPOTS) {
    const d = (h.lat - lat) ** 2 + (h.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best.name;
}

export function matchHotspotByName(s: string): string | null {
  const q = s.toLowerCase();
  for (const h of SF_HOTSPOTS) {
    const name = h.name.toLowerCase();
    const district = h.district.toLowerCase();
    if (q.includes(name) || q.includes(district)) return h.name;
    const first = name.split(/[\s/]/)[0]!;
    if (first.length >= 4 && q.includes(first)) return h.name;
  }
  return null;
}

export function projectToViewport(
  lat: number,
  lng: number,
  opts: ProjectOpts,
): { x: number; y: number } {
  const { width, height, padding } = opts;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const tx = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN || 1);
  const ty = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN || 1);
  return {
    x: Math.round(padding + tx * usableW),
    y: Math.round(padding + (1 - ty) * usableH),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test -- neighborhoods`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/lib/kg/neighborhoods.ts apps/web/lib/kg/neighborhoods.test.ts
git -c commit.gpgsign=false commit -m "feat(kg): hotspot geometry primitives (nearest, match, project)"
```

---

## Task 2: Neighborhood resolver

**Files:**
- Modify: `apps/web/lib/kg/neighborhoods.ts`
- Test: `apps/web/lib/kg/neighborhoods.test.ts`

The resolver is pure: it takes a node and a precomputed `NeighborhoodContext` of id→neighborhood maps (the relational wiring that builds the context lives in `data.ts`, Task 4).

- [ ] **Step 1: Write the failing test** (append to `neighborhoods.test.ts`)

```ts
import { resolveNeighborhood, type NeighborhoodContext } from "./neighborhoods";
import type { KgNode } from "@/components/kg/types";

function ctx(over: Partial<NeighborhoodContext> = {}): NeighborhoodContext {
  return {
    gangNeighborhood: new Map(),
    memberToGang: new Map(),
    incidentNeighborhood: new Map(),
    ...over,
  };
}
const node = (id: string, kind: KgNode["kind"]): KgNode => ({ id, kind, label: id });

describe("resolveNeighborhood", () => {
  it("territory resolves from its own coords baked into the node meta", () => {
    const n: KgNode = { id: "territory:1", kind: "territory", label: "T", meta: { lat: 37.7335, lng: -122.3893 } };
    expect(resolveNeighborhood(n, ctx())).toBe("Bayview Hunters Point");
  });
  it("member resolves via its gang", () => {
    const c = ctx({
      memberToGang: new Map([["member:9", "gang:1"]]),
      gangNeighborhood: new Map([["gang:1", "Mission"]]),
    });
    expect(resolveNeighborhood(node("member:9", "member"), c)).toBe("Mission");
  });
  it("incident resolves via incidentNeighborhood map", () => {
    const c = ctx({ incidentNeighborhood: new Map([["inc:5", "Tenderloin"]]) });
    expect(resolveNeighborhood(node("inc:5", "incident"), c)).toBe("Tenderloin");
  });
  it("falls back to Unmapped", () => {
    expect(resolveNeighborhood(node("member:x", "member"), ctx())).toBe("Unmapped");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test -- neighborhoods`
Expected: FAIL — `resolveNeighborhood is not a function`.

- [ ] **Step 3: Write minimal implementation** (append to `neighborhoods.ts`)

```ts
import type { KgNode } from "@/components/kg/types";

export const UNMAPPED = "Unmapped";

export interface NeighborhoodContext {
  /** `gang:<id>` -> neighborhood name */
  gangNeighborhood: Map<string, string>;
  /** `member:<id>` -> `gang:<id>` */
  memberToGang: Map<string, string>;
  /** `inc:<id>` -> neighborhood name (precomputed in data.ts) */
  incidentNeighborhood: Map<string, string>;
}

export function resolveNeighborhood(
  node: KgNode,
  c: NeighborhoodContext,
): string {
  const meta = node.meta ?? {};
  const lat = typeof meta.lat === "number" ? meta.lat : null;
  const lng = typeof meta.lng === "number" ? meta.lng : null;
  if (lat != null && lng != null) return nearestHotspot(lat, lng);

  if (node.kind === "gang") {
    return c.gangNeighborhood.get(node.id) ?? UNMAPPED;
  }
  if (node.kind === "member") {
    const gang = c.memberToGang.get(node.id);
    return (gang && c.gangNeighborhood.get(gang)) ?? UNMAPPED;
  }
  if (node.kind === "incident") {
    return c.incidentNeighborhood.get(node.id) ?? UNMAPPED;
  }
  // alerts/decisions/baselines/etc. are linked to an incident or gang in
  // data.ts which writes their resolved neighborhood into meta.neighborhood
  if (typeof meta.neighborhood === "string" && meta.neighborhood) {
    return meta.neighborhood;
  }
  return UNMAPPED;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test -- neighborhoods`
Expected: PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/lib/kg/neighborhoods.ts apps/web/lib/kg/neighborhoods.test.ts
git -c commit.gpgsign=false commit -m "feat(kg): pure resolveNeighborhood with context maps"
```

---

## Task 3: Cluster, stub, and view types

**Files:**
- Modify: `apps/web/components/kg/types.ts`

- [ ] **Step 1: Add types** (append to `apps/web/components/kg/types.ts`)

```ts
// --- Overview/Detail redesign types ---

/** A neighborhood cluster bubble in the Tier-1 overview. */
export interface NeighborhoodCluster {
  neighborhood: string;
  nodeIds: string[];
  incidentCount: number;
  alertCount: number; // unacknowledged
  maxSeverity: number;
}

/** Aggregated arc between two neighborhood clusters. */
export interface ClusterEdge {
  id: string;
  a: string;
  b: string;
  weight: number;
}

/** Collapsed "+N <kind> ⊕" stub in the Tier-2 detail view. */
export interface StubNode {
  id: string;
  neighborhood: string;
  kind: KgNodeKind;
  count: number;
}

export type KgView =
  | { mode: "overview" }
  | { mode: "detail"; neighborhood: string };
```

Also modify the existing `KgNode` interface — add the optional field:

```ts
export interface KgNode {
  id: string;
  kind: KgNodeKind;
  label: string;
  sub?: string;
  meta?: Record<string, string | number>;
  source?: "live" | "fixture";
  neighborhood?: string; // derived server-side in data.ts
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/components/kg/types.ts
git -c commit.gpgsign=false commit -m "feat(kg): cluster/stub/view types + KgNode.neighborhood"
```

---

## Task 4: Annotate nodes with neighborhood in data.ts

**Files:**
- Modify: `apps/web/app/(app)/kg/data.ts` (insert before the final `return { nodes, edges };`, line ~561)

Build the `NeighborhoodContext` from the raw rows already in scope (`gangs`, `members`, `territories`, `incidents`, `events`, `gbrainRecords`), then set `neighborhood` on every node. This is glue, not pure logic (covered indirectly by Task 1/2 tests + Task 11 manual check).

- [ ] **Step 1: Add the annotation block**

In `apps/web/app/(app)/kg/data.ts`, add this import near the top with the other imports:

```ts
import {
  resolveNeighborhood,
  nearestHotspot,
  matchHotspotByName,
  UNMAPPED,
  type NeighborhoodContext,
} from "@/lib/kg/neighborhoods";
```

Then immediately before `return { nodes, edges };` insert:

```ts
  // --- Derive a neighborhood for every node (Overview+Detail redesign) ---
  const gangNeighborhood = new Map<string, string>();
  for (const g of gangs) {
    const terr = territories.filter((t) => t.gang_id === g.id);
    if (terr.length) {
      const counts = new Map<string, number>();
      for (const t of terr) {
        const nb = nearestHotspot(t.center_lat, t.center_lng);
        counts.set(nb, (counts.get(nb) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) gangNeighborhood.set(`gang:${g.id}`, top[0]);
    }
  }

  const memberToGang = new Map<string, string>();
  for (const m of members) {
    if (m.gang_id) memberToGang.set(`member:${m.id}`, `gang:${m.gang_id}`);
  }

  const incidentNeighborhood = new Map<string, string>();
  for (const i of incidents) {
    const ev = events.find(
      (e) => e.related_incident_id === i.id && e.lat != null && e.lng != null,
    );
    if (ev && ev.lat != null && ev.lng != null) {
      incidentNeighborhood.set(`inc:${i.id}`, nearestHotspot(ev.lat, ev.lng));
      continue;
    }
    if (i.suspect_gang_id) {
      const nb = gangNeighborhood.get(`gang:${i.suspect_gang_id}`);
      if (nb) {
        incidentNeighborhood.set(`inc:${i.id}`, nb);
        continue;
      }
    }
    const cam = i.clips[0]?.cameras ?? null;
    if (cam) {
      const m = matchHotspotByName(`${cam.route} ${cam.description ?? ""}`);
      if (m) incidentNeighborhood.set(`inc:${i.id}`, m);
    }
  }

  const nctx: NeighborhoodContext = {
    gangNeighborhood,
    memberToGang,
    incidentNeighborhood,
  };

  // territories carry coords -> bake into meta so the resolver can use them
  for (const n of nodes) {
    if (n.kind === "territory") {
      const tid = n.id.replace(/^territory:/, "");
      const t = territories.find((x) => x.id === tid);
      if (t) {
        n.meta = { ...(n.meta ?? {}), lat: t.center_lat, lng: t.center_lng };
      }
    }
    if (n.kind === "event") {
      const eid = n.id.replace(/^event:/, "");
      const e = events.find((x) => String(x.id) === eid);
      if (e && e.lat != null && e.lng != null) {
        n.meta = { ...(n.meta ?? {}), lat: e.lat, lng: e.lng };
      }
    }
  }

  // pass 1: gangs, members, incidents, territories, events
  for (const n of nodes) {
    n.neighborhood = resolveNeighborhood(n, nctx);
  }

  // pass 2: alerts/decisions/arrests/baselines/patterns/locations inherit
  // from the incident or gang they connect to via edges
  const nbById = new Map(nodes.map((n) => [n.id, n.neighborhood ?? UNMAPPED]));
  for (const n of nodes) {
    if (n.neighborhood && n.neighborhood !== UNMAPPED) continue;
    const linked = edges.find((e) => e.source === n.id || e.target === n.id);
    if (linked) {
      const other = linked.source === n.id ? linked.target : linked.source;
      const nb = nbById.get(other);
      if (nb && nb !== UNMAPPED) {
        n.neighborhood = nb;
        continue;
      }
    }
    n.neighborhood = UNMAPPED;
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS. (If `events`/`incidents`/`territories` are `const`, mutating `n.meta`/`n.neighborhood` is fine — the array elements are mutable objects.)

- [ ] **Step 3: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add "apps/web/app/(app)/kg/data.ts"
git -c commit.gpgsign=false commit -m "feat(kg): annotate every node with derived neighborhood"
```

---

## Task 5: buildOverview aggregation

**Files:**
- Create: `apps/web/lib/kg/aggregate.ts`
- Test: `apps/web/lib/kg/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/kg/aggregate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOverview, OVERVIEW_EDGE_MIN } from "./aggregate";
import type { KgNode, KgEdge } from "@/components/kg/types";

const n = (id: string, kind: KgNode["kind"], neighborhood: string, meta: KgNode["meta"] = {}): KgNode =>
  ({ id, kind, label: id, neighborhood, meta });

describe("buildOverview", () => {
  const nodes: KgNode[] = [
    n("inc:1", "incident", "Mission", { severity: 3 }),
    n("inc:2", "incident", "Mission", { severity: 5 }),
    n("inc:3", "incident", "Bayview Hunters Point", { severity: 2 }),
    n("alert:1", "alert", "Mission", {}),
    n("alert:2", "alert", "Mission", { ack: "acknowledged" }),
    n("gang:1", "gang", "Mission"),
    n("gang:1b", "gang", "Bayview Hunters Point"),
  ];
  const edges: KgEdge[] = [
    { id: "e1", source: "gang:1", target: "inc:3" }, // Mission <-> Bayview
    { id: "e2", source: "gang:1", target: "inc:1" }, // intra-Mission
  ];

  it("creates one cluster per distinct neighborhood", () => {
    const { clusters } = buildOverview(nodes, edges);
    expect(clusters.map((c) => c.neighborhood).sort()).toEqual([
      "Bayview Hunters Point",
      "Mission",
    ]);
  });
  it("counts incidents and unacked alerts and max severity per cluster", () => {
    const { clusters } = buildOverview(nodes, edges);
    const mission = clusters.find((c) => c.neighborhood === "Mission")!;
    expect(mission.incidentCount).toBe(2);
    expect(mission.alertCount).toBe(1); // alert:2 is acknowledged
    expect(mission.maxSeverity).toBe(5);
  });
  it("creates a cross-neighborhood edge only at/above the threshold", () => {
    const { clusterEdges } = buildOverview(nodes, edges);
    if (OVERVIEW_EDGE_MIN <= 1) {
      expect(clusterEdges).toHaveLength(1);
      expect(clusterEdges[0]!.weight).toBe(1);
    } else {
      expect(clusterEdges).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test -- aggregate`
Expected: FAIL — `Cannot find module './aggregate'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/lib/kg/aggregate.ts`:

```ts
import type {
  KgNode,
  KgEdge,
  NeighborhoodCluster,
  ClusterEdge,
} from "@/components/kg/types";

/** Minimum cross-neighborhood link count to draw an overview arc. */
export const OVERVIEW_EDGE_MIN = 1;

export function buildOverview(
  nodes: KgNode[],
  edges: KgEdge[],
): { clusters: NeighborhoodCluster[]; clusterEdges: ClusterEdge[] } {
  const byNbhd = new Map<string, NeighborhoodCluster>();
  const nbOf = new Map<string, string>();

  for (const node of nodes) {
    const nb = node.neighborhood ?? "Unmapped";
    nbOf.set(node.id, nb);
    let c = byNbhd.get(nb);
    if (!c) {
      c = {
        neighborhood: nb,
        nodeIds: [],
        incidentCount: 0,
        alertCount: 0,
        maxSeverity: 0,
      };
      byNbhd.set(nb, c);
    }
    c.nodeIds.push(node.id);
    if (node.kind === "incident") {
      c.incidentCount++;
      const sev = Number(node.meta?.severity ?? 0);
      if (sev > c.maxSeverity) c.maxSeverity = sev;
    }
    if (node.kind === "alert" && node.meta?.ack !== "acknowledged") {
      c.alertCount++;
    }
  }

  const pairCount = new Map<string, number>();
  for (const e of edges) {
    const a = nbOf.get(e.source);
    const b = nbOf.get(e.target);
    if (!a || !b || a === b) continue;
    const key = [a, b].sort().join(" ");
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }

  const clusterEdges: ClusterEdge[] = [];
  for (const [key, weight] of pairCount) {
    if (weight < OVERVIEW_EDGE_MIN) continue;
    const [a, b] = key.split(" ") as [string, string];
    clusterEdges.push({ id: `ce:${a}->${b}`, a, b, weight });
  }

  const clusters = [...byNbhd.values()].sort(
    (x, y) => y.incidentCount - x.incidentCount,
  );
  return { clusters, clusterEdges };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test -- aggregate`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/lib/kg/aggregate.ts apps/web/lib/kg/aggregate.test.ts
git -c commit.gpgsign=false commit -m "feat(kg): buildOverview neighborhood aggregation"
```

---

## Task 6: buildDetail spine + stubs

**Files:**
- Modify: `apps/web/lib/kg/aggregate.ts`
- Test: `apps/web/lib/kg/aggregate.test.ts`

Spine = all gangs + unacked alerts + decisions + the `DETAIL_INCIDENT_LIMIT` (8) most-recent incidents. Everything else for the neighborhood collapses into one `StubNode` per kind.

- [ ] **Step 1: Write the failing test** (append to `aggregate.test.ts`)

```ts
import { buildDetail, DETAIL_INCIDENT_LIMIT } from "./aggregate";

describe("buildDetail", () => {
  const nodes: KgNode[] = [
    n("gang:1", "gang", "Mission"),
    n("alert:1", "alert", "Mission", {}),
    n("dec:1", "decision", "Mission"),
    ...Array.from({ length: 12 }, (_, i) =>
      n(`inc:${i}`, "incident", "Mission", { created_at: `2026-05-${10 + i}` }),
    ),
    ...Array.from({ length: 5 }, (_, i) => n(`member:${i}`, "member", "Mission")),
    n("inc:other", "incident", "Bayview Hunters Point"),
  ];
  const edges: KgEdge[] = [{ id: "e1", source: "gang:1", target: "alert:1" }];

  it("keeps gangs, alerts, decisions, and only the newest N incidents in the spine", () => {
    const { spine } = buildDetail("Mission", nodes, edges);
    const ids = spine.map((s) => s.id);
    expect(ids).toContain("gang:1");
    expect(ids).toContain("alert:1");
    expect(ids).toContain("dec:1");
    const inc = ids.filter((i) => i.startsWith("inc:"));
    expect(inc).toHaveLength(DETAIL_INCIDENT_LIMIT);
  });
  it("collapses the overflow into per-kind stubs", () => {
    const { stubs } = buildDetail("Mission", nodes, edges);
    const memberStub = stubs.find((s) => s.kind === "member");
    const incStub = stubs.find((s) => s.kind === "incident");
    expect(memberStub?.count).toBe(5);
    expect(incStub?.count).toBe(12 - DETAIL_INCIDENT_LIMIT);
  });
  it("excludes nodes from other neighborhoods", () => {
    const { spine, stubs } = buildDetail("Mission", nodes, edges);
    expect(spine.find((s) => s.id === "inc:other")).toBeUndefined();
    expect(stubs.every((s) => s.neighborhood === "Mission")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test -- aggregate`
Expected: FAIL — `buildDetail is not a function`.

- [ ] **Step 3: Write minimal implementation** (append to `aggregate.ts`)

```ts
import type { StubNode, KgNodeKind } from "@/components/kg/types";

export const DETAIL_INCIDENT_LIMIT = 8;
const SPINE_KINDS: ReadonlySet<KgNodeKind> = new Set([
  "gang",
  "decision",
]);

export function buildDetail(
  neighborhood: string,
  nodes: KgNode[],
  edges: KgEdge[],
): { spine: KgNode[]; stubs: StubNode[]; edges: KgEdge[] } {
  const local = nodes.filter((x) => (x.neighborhood ?? "Unmapped") === neighborhood);

  const spine: KgNode[] = [];
  const overflow = new Map<KgNodeKind, number>();

  const incidents = local
    .filter((x) => x.kind === "incident")
    .sort((a, b) =>
      String(b.meta?.created_at ?? "").localeCompare(String(a.meta?.created_at ?? "")),
    );
  incidents.slice(0, DETAIL_INCIDENT_LIMIT).forEach((i) => spine.push(i));
  if (incidents.length > DETAIL_INCIDENT_LIMIT) {
    overflow.set("incident", incidents.length - DETAIL_INCIDENT_LIMIT);
  }

  for (const x of local) {
    if (x.kind === "incident") continue;
    const isSpine =
      SPINE_KINDS.has(x.kind) ||
      (x.kind === "alert" && x.meta?.ack !== "acknowledged");
    if (isSpine) spine.push(x);
    else overflow.set(x.kind, (overflow.get(x.kind) ?? 0) + 1);
  }

  const stubs: StubNode[] = [...overflow.entries()].map(([kind, count]) => ({
    id: `stub:${neighborhood}:${kind}`,
    neighborhood,
    kind,
    count,
  }));

  const spineIds = new Set(spine.map((s) => s.id));
  const detailEdges = edges.filter(
    (e) => spineIds.has(e.source) && spineIds.has(e.target),
  );

  return { spine, stubs, edges: detailEdges };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test -- aggregate`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/lib/kg/aggregate.ts apps/web/lib/kg/aggregate.test.ts
git -c commit.gpgsign=false commit -m "feat(kg): buildDetail spine + per-kind stubs"
```

---

## Task 7: Overview map component

**Files:**
- Create: `apps/web/components/kg/overview-map.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/components/kg/overview-map.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import { SF_HOTSPOTS } from "@/lib/dispatch-hotspots";
import { projectToViewport } from "@/lib/kg/neighborhoods";
import { buildOverview } from "@/lib/kg/aggregate";
import type { KgNode, KgEdge } from "./types";

const VIEW = { width: 1200, height: 820, padding: 90 };

interface Props {
  nodes: KgNode[];
  edges: KgEdge[];
  onOpenNeighborhood: (neighborhood: string) => void;
}

export function OverviewMap({ nodes, edges, onOpenNeighborhood }: Props) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const { clusters, clusterEdges } = buildOverview(nodes, edges);
    const centroid = new Map(SF_HOTSPOTS.map((h) => [h.name, h]));
    const pos = new Map<string, { x: number; y: number }>();

    const rfNodes: Node[] = clusters.map((c, idx) => {
      const h = centroid.get(c.neighborhood);
      const p = h
        ? projectToViewport(h.lat, h.lng, VIEW)
        : { x: 60, y: 60 + idx * 70 }; // Unmapped / unknown -> top-left stack
      pos.set(c.neighborhood, p);
      const size = Math.min(64, 26 + c.incidentCount * 1.5);
      return {
        id: `nb:${c.neighborhood}`,
        position: p,
        data: { label: c.neighborhood },
        type: "default",
        draggable: false,
        style: {
          width: size,
          height: size,
          borderRadius: 999,
          border: `${1 + Math.min(4, c.maxSeverity)}px solid #000`,
          background: "#fff",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
        },
      };
    });

    const rfEdges: Edge[] = clusterEdges
      .filter((e) => pos.has(e.a) && pos.has(e.b))
      .map((e) => ({
        id: e.id,
        source: `nb:${e.a}`,
        target: `nb:${e.b}`,
        type: "default",
        style: { stroke: "#737373", strokeWidth: Math.min(4, e.weight) },
      }));

    return { rfNodes, rfEdges };
  }, [nodes, edges]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      nodesDraggable={false}
      onNodeClick={(_, n) =>
        onOpenNeighborhood(String(n.id).replace(/^nb:/, ""))
      }
      minZoom={0.4}
      maxZoom={2}
    >
      <Background color="#e5e5e5" gap={22} size={1} />
      <Controls showInteractive={false} className="!border-neutral-200 !bg-white !shadow-none" />
    </ReactFlow>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/components/kg/overview-map.tsx
git -c commit.gpgsign=false commit -m "feat(kg): geographic overview map component"
```

---

## Task 8: Neighborhood detail component

**Files:**
- Create: `apps/web/components/kg/neighborhood-detail.tsx`

Deterministic radial: spine hub in the center, spine nodes on a ring, stubs on an outer ring. Reuses the existing `KgFlowNode` renderer.

- [ ] **Step 1: Write the component**

Create `apps/web/components/kg/neighborhood-detail.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import { KgFlowNode, type KgNodeData } from "./kg-node";
import { buildDetail } from "@/lib/kg/aggregate";
import type { KgNode, KgEdge } from "./types";

const nodeTypes = { kg: KgFlowNode };

interface Props {
  neighborhood: string;
  nodes: KgNode[];
  edges: KgEdge[];
  onSelect: (id: string) => void;
}

function ring(count: number, radius: number, cx = 0, cy = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  });
}

export function NeighborhoodDetail({
  neighborhood,
  nodes,
  edges,
  onSelect,
}: Props) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const { spine, stubs, edges: dEdges } = buildDetail(neighborhood, nodes, edges);
    const spineRing = ring(spine.length, 320);
    const stubRing = ring(stubs.length, 560);

    const rfNodes: Node[] = [
      ...spine.map((node, i) => {
        const data: KgNodeData = { node, state: "default" };
        return {
          id: node.id,
          type: "kg",
          position: spineRing[i] ?? { x: 0, y: 0 },
          data: data as unknown as Record<string, unknown>,
        };
      }),
      ...stubs.map((s, i) => {
        const synthetic: KgNode = {
          id: s.id,
          kind: s.kind,
          label: `+${s.count} ${s.kind}`,
          sub: "click to expand",
        };
        const data: KgNodeData = { node: synthetic, state: "dimmed" };
        return {
          id: s.id,
          type: "kg",
          position: stubRing[i] ?? { x: 0, y: 0 },
          data: data as unknown as Record<string, unknown>,
        };
      }),
    ];

    const rfEdges: Edge[] = dEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: "smoothstep",
      style: { stroke: "#404040", strokeWidth: 1 },
    }));

    return { rfNodes, rfEdges };
  }, [neighborhood, nodes, edges]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      onNodeClick={(_, n) => onSelect(String(n.id))}
      minZoom={0.3}
      maxZoom={2.2}
    >
      <Background color="#ededed" gap={18} size={1} />
      <Controls showInteractive={false} className="!border-neutral-200 !bg-white !shadow-none" />
    </ReactFlow>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/components/kg/neighborhood-detail.tsx
git -c commit.gpgsign=false commit -m "feat(kg): bounded radial neighborhood detail component"
```

---

## Task 9: Slim kg-graph orchestrator

**Files:**
- Modify (full rewrite): `apps/web/components/kg/kg-graph.tsx`

Replaces the 528-line monolith. Holds view state, breadcrumb, and node selection; keeps the existing `KgInspector` + `GbrainQueryPanel`. **Deletes `layoutPositions` (the 450-iteration force sim) entirely.**

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `apps/web/components/kg/kg-graph.tsx` with:

```tsx
"use client";

import { useMemo, useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { OverviewMap } from "./overview-map";
import { NeighborhoodDetail } from "./neighborhood-detail";
import { KgInspector } from "./kg-inspector";
import { GbrainQueryPanel } from "./gbrain-query-panel";
import type { KgEdge, KgNode, KgView } from "./types";

interface Props {
  nodes: KgNode[];
  edges: KgEdge[];
}

function computeNeighbors(nodeId: string, nodes: KgNode[], edges: KgEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: { node: KgNode; direction: "in" | "out"; edgeLabel?: string }[] = [];
  for (const e of edges) {
    if (e.source === nodeId) {
      const t = byId.get(e.target);
      if (t) out.push({ node: t, direction: "out", edgeLabel: e.label });
    } else if (e.target === nodeId) {
      const s = byId.get(e.source);
      if (s) out.push({ node: s, direction: "in", edgeLabel: e.label });
    }
  }
  return out;
}

function GraphInner({ nodes, edges }: Props) {
  const [view, setView] = useState<KgView>({ mode: "overview" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const openNeighborhood = useCallback((neighborhood: string) => {
    setSelectedId(null);
    setView({ mode: "detail", neighborhood });
  }, []);

  const backToOverview = useCallback(() => {
    setSelectedId(null);
    setView({ mode: "overview" });
  }, []);

  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, nodes],
  );
  const neighbors = useMemo(
    () => (selectedId ? computeNeighbors(selectedId, nodes, edges) : []),
    [selectedId, nodes, edges],
  );

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full">
      {/* Breadcrumb */}
      <div className="pointer-events-auto absolute left-4 top-4 z-10 flex items-center gap-2 border border-neutral-200 bg-white px-3 py-1.5 font-mono text-[11px]">
        <button
          type="button"
          onClick={backToOverview}
          className={
            view.mode === "overview"
              ? "font-semibold"
              : "text-neutral-500 hover:text-black"
          }
        >
          SF
        </button>
        {view.mode === "detail" && (
          <>
            <span className="text-neutral-300">▸</span>
            <span className="font-semibold">{view.neighborhood}</span>
            <button
              type="button"
              onClick={backToOverview}
              className="ml-2 border border-neutral-200 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
            >
              ‹ back
            </button>
          </>
        )}
      </div>

      {view.mode === "overview" ? (
        <OverviewMap
          nodes={nodes}
          edges={edges}
          onOpenNeighborhood={openNeighborhood}
        />
      ) : (
        <NeighborhoodDetail
          neighborhood={view.neighborhood}
          nodes={nodes}
          edges={edges}
          onSelect={setSelectedId}
        />
      )}

      {selectedNode && !selectedNode.id.startsWith("stub:") && (
        <KgInspector
          node={selectedNode}
          neighbors={neighbors}
          onClose={() => setSelectedId(null)}
          onNavigate={(id) => setSelectedId(id)}
          onTrace={() => {}}
          tracing={false}
        />
      )}

      {!selectedNode && (
        <GbrainQueryPanel onFocusGbrainId={(id) => setSelectedId(id)} />
      )}
    </div>
  );
}

export function KgGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}

export type { KgEdge, KgNode };
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS. (`kg-toolbar.tsx` is no longer imported here — that is intentional; it is not deleted, just unused for now.)

- [ ] **Step 3: Verify the force sim is gone**

Run: `grep -n "layoutPositions\|iterations\|temperature" apps/web/components/kg/kg-graph.tsx`
Expected: no output (the simulation is fully removed).

- [ ] **Step 4: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/components/kg/kg-graph.tsx
git -c commit.gpgsign=false commit -m "feat(kg): slim orchestrator, delete 450-iteration force sim"
```

---

## Task 10: Keep realtime calm (scope the refresh)

**Files:**
- Modify: `apps/web/components/kg/realtime-refresh.tsx`

The redesign already removes the worst jank (positions are now deterministic, so a `router.refresh()` no longer reshuffles — bubbles re-project to the same spots). The remaining fix: debounce so a burst of DB events does not thrash, and keep the visible "Updated" pip.

- [ ] **Step 1: Add a debounce to the refresh**

In `apps/web/components/kg/realtime-refresh.tsx`, replace the body of the `channel.on(...)` callback (the block that calls `setFlash(true)` and `router.refresh()`) with a debounced version. Replace:

```ts
        (payload: { table: string; eventType: string }) => {
          lastEventRef.current = `${payload.table}:${payload.eventType}`;
          setFlash(true);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(false), 1200);
          router.refresh();
        },
```

with:

```ts
        (payload: { table: string; eventType: string }) => {
          lastEventRef.current = `${payload.table}:${payload.eventType}`;
          setFlash(true);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(false), 1200);
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 800);
        },
```

Add the new ref next to `flashTimer` (find `const flashTimer = useRef...` and add below it):

```ts
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

And in the cleanup `return () => { ... }` of that `useEffect`, add before `supabase.removeChannel(channel);`:

```ts
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add apps/web/components/kg/realtime-refresh.tsx
git -c commit.gpgsign=false commit -m "feat(kg): debounce realtime refresh to avoid event thrash"
```

---

## Task 11: Full integration verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test + typecheck gate**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack/apps/web
pnpm test
pnpm typecheck
```
Expected: all tests PASS (neighborhoods 13, aggregate 6, plus pre-existing suites), typecheck clean.

- [ ] **Step 2: Manual verification against the running app**

The dev server is running (`http://localhost:3000`, started via `pnpm dev` in `apps/web`; restart with `cd apps/web && pnpm dev` if needed). Log in, go to `http://localhost:3000/kg`, and confirm each:

  1. **Overview renders** — a set of neighborhood bubbles positioned geographically (Bayview lower-right, Tenderloin/Nob upper-center, Sunset left), NOT a hairball. No serpentine edges.
  2. **Sizing reads** — higher-incident neighborhoods are visibly larger / thicker-bordered.
  3. **Drill-in** — clicking a bubble switches to that neighborhood's detail graph; breadcrumb shows `SF ▸ <name>`.
  4. **Bounded detail** — detail shows a small spine + `+N <kind>` stub nodes, not every node.
  5. **Back** — clicking `‹ back` (or `SF`) returns to the overview at the same positions.
  6. **Inspector** — clicking a real (non-stub) node in detail opens `KgInspector` with its panels.
  7. **Stable realtime** — leave it ~30s; when the live pip flashes "Updated", the overview does NOT reshuffle (bubbles stay put).
  8. **No console errors** — DevTools console is clean of React/React Flow errors.

- [ ] **Step 3: Final commit (if any verification tweaks were needed)**

```bash
cd /Users/hari7aran/Documents/GitHub/YC-Hackthon-GBrain-GStack
git add -p
git -c commit.gpgsign=false commit -m "fix(kg): integration verification adjustments"
```

(Skip if Steps 1–2 passed with no changes.)

---

## Self-Review

**Spec coverage:**
- Two-tier overview/detail → Tasks 7, 8, 9. ✓
- Monochrome retained → components use only `#000`/neutral. ✓
- Neighborhood backbone + `SF_HOTSPOTS` taxonomy → Tasks 1, 4. ✓
- Resolver priority chain (incidents have no coords; via event/gang) → Tasks 2, 4. ✓
- Geographic projection, fixed positions → Tasks 1, 7. ✓
- Aggregation / `+N` stubs → Task 6, 8. ✓
- Force-sim deletion → Task 9 (explicit grep check). ✓
- Calm realtime → Task 10. ✓
- Inter-cluster edges + threshold → Task 5. ✓
- File split → Tasks 1–9 create exactly the spec's file table. ✓
- TDD pure functions, manual component check (node-only vitest) → Tasks 1–6 TDD, 7–11 manual. ✓
- Gang lens shipped as deferred → NOT in tasks; consistent with spec's "Deferred" section. ✓ (Documented gap, intentional.)

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output. ✓

**Type consistency:** `NeighborhoodContext`, `NeighborhoodCluster`, `ClusterEdge`, `StubNode`, `KgView` defined in Task 3, consumed with matching field names in Tasks 4–9. `buildOverview`/`buildDetail`/`resolveNeighborhood`/`projectToViewport`/`nearestHotspot`/`matchHotspotByName` signatures consistent across tasks. ✓

**Intentional scope note:** the gang-lens toggle is deferred per the approved spec; no task implements it. If desired in the first cut, add a follow-up task adding a gang filter to `OverviewMap` (highlight/dim, no re-layout).
