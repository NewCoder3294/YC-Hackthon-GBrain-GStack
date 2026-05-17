# Signal Correlator + Incident Ranker — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` tracking.

**Goal:** Consume `signal_events`, collapse correlated multi-source signals into incidents, rank them for dispatch, write them to GBrain, serve a ranked triage queue.

**Architecture:** Mirror the proven `packages/ingestion/src/baseline/` pattern — pure unit-tested modules + DI'd Anthropic seam + IO writer + IO run shell + thin Next API/cron/UI. Neighborhood context is derived by reusing `baseline/metrics.ts aggregate()` over the DataSF window (single source of truth — no brittle GBrain-markdown parsing). Spec: `docs/superpowers/specs/2026-05-16-signal-correlator-incident-ranker-design.md`.

**Tech Stack:** TypeScript, vitest, drizzle-orm, zod, `@anthropic-ai/sdk` (already a dep), Next.js App Router, Supabase.

All new code under `packages/ingestion/src/correlate/`. TDD per unit: write test → run fail → implement → run pass → commit. Run tests with `pnpm --filter @caltrans/ingestion test`. Keep the 12-suite/75-test ingestion suite green.

---

### Task 1: `config.ts` + `types.ts`

**Files:** Create `packages/ingestion/src/correlate/config.ts`, `packages/ingestion/src/correlate/types.ts`, `packages/ingestion/src/correlate/config.test.ts`

- [ ] **types.ts** — exact shared types:

```ts
export type CorrelatorSource = "camera" | "call_911" | "citizen" | "datasf";

export interface LiveSignal {
  id: string; source: CorrelatorSource; sourceType: string;
  feed: string | null; occurredAt: string; lat: number; lng: number;
  category: string; affinityGroup: string; confidence: number;
  neighborhood: string; summary: string;
}
export interface Centroid { neighborhood: string; lat: number; lng: number; }
export interface CandidateCluster {
  id: string; signals: LiveSignal[]; neighborhood: string; hasDatasfDup: boolean;
}
export interface AmbiguousMerge {
  signalId: string; clusterId: string;
  reason: "category-mismatch-in-radius" | "category-match-near-radius";
  distanceM: number;
}
export interface NeighborhoodContext {
  neighborhood: string; baseline30d: number;
  categoryRate: Record<string, number>; clearanceRate: number;
  clearancePercentile: number; found: boolean;
}
export interface ScoreFactors {
  corroboration: number; severity: number; anomaly: number;
  equity: number; degraded: boolean;
}
export type Tier = "P1" | "P2" | "P3" | "P4";
export interface ScoredIncident {
  cluster: CandidateCluster; factors: ScoreFactors;
  priority: number; tier: Tier; rationale: string;
}
```

- [ ] **config.ts** — named constants (no magic numbers):

```ts
export const WINDOW_HOURS = 48;
export const BASELINE_DAYS = 365;
export const RADIUS_M = 150;
export const TIME_GAP_MIN = 20;
export const AMBIGUOUS_RADIUS_FACTOR = 1.5;
export const WEIGHTS = { corroboration: 0.3, severity: 0.35, anomaly: 0.2, equity: 0.15 } as const;
export const TIER_THRESHOLDS = { P1: 0.75, P2: 0.5, P3: 0.25 } as const; // else P4

// raw category/keyword -> [affinityGroup, severity 0..1]
export const CATEGORY_AFFINITY: ReadonlyArray<readonly [RegExp, string, number]> = [
  [/shots?\s*fired|gunfire|gunshot|firearm|weapon|armed/i, "weapons-violence", 1.0],
  [/homicide|stab|knife|shooting/i, "weapons-violence", 1.0],
  [/assault|battery|fight|brawl|jumped/i, "assault", 0.8],
  [/robb|mugg/i, "robbery", 0.75],
  [/medical|ambulance|bleeding|unconscious|not moving/i, "medical", 0.7],
  [/burglary|breaking|trespass/i, "property", 0.5],
  [/larceny|theft|stole|shoplift|vandal|graffiti/i, "property", 0.4],
  [/vehicle|car|sedan|traffic|collision|dui/i, "vehicle", 0.4],
  [/person|pedestrian|loiter|disturbance|noise/i, "presence", 0.3],
  [/false alarm|cancel|firecracker|unfounded/i, "ambiguous", 0.2],
];
export const PRIORITY_SEVERITY: Record<string, number> = { A: 1.0, B: 0.7, C: 0.4, E: 0.2 };
export const DEFAULT_CONFIDENCE = 0.5;
```

- [ ] **config.test.ts**: assert `WEIGHTS` sum ≈ 1, thresholds strictly descending, every `CATEGORY_AFFINITY` severity in [0,1]. Run `pnpm --filter @caltrans/ingestion test src/correlate/config.test.ts` → PASS.
- [ ] **Commit:** `git add packages/ingestion/src/correlate/{config,types,config.test}.ts && git commit -m "feat(correlate): config + shared types"`

---

### Task 2: `geo.ts`

**Files:** Create `geo.ts`, `geo.test.ts`

- [ ] Test first (`geo.test.ts`): `haversineMeters` SF two known points ≈ expected ±5%; `centroidsFromSignals` averages lat/lng per neighborhood; `nearestNeighborhood` returns closest centroid; empty centroids → `"Unknown"`.
- [ ] Implement `geo.ts`:

```ts
import type { Centroid } from "./types";
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
export function centroidsFromSignals(rows: ReadonlyArray<{ neighborhood: string; lat: number; lng: number }>): Centroid[] {
  const acc = new Map<string, { lat: number; lng: number; n: number }>();
  for (const r of rows) {
    const k = r.neighborhood.trim();
    if (!k || k.toLowerCase() === "unknown") continue;
    const c = acc.get(k) ?? { lat: 0, lng: 0, n: 0 };
    acc.set(k, { lat: c.lat + r.lat, lng: c.lng + r.lng, n: c.n + 1 });
  }
  return [...acc.entries()].map(([neighborhood, c]) => ({ neighborhood, lat: c.lat / c.n, lng: c.lng / c.n }));
}
export function nearestNeighborhood(lat: number, lng: number, centroids: readonly Centroid[]): string {
  let best = "Unknown", bestD = Infinity;
  for (const c of centroids) {
    const d = haversineMeters(lat, lng, c.lat, c.lng);
    if (d < bestD) { bestD = d; best = c.neighborhood; }
  }
  return best;
}
```

- [ ] Run test → PASS. Commit `feat(correlate): geo (haversine + centroids + nearest)`.

---

### Task 3: `window.ts`

**Files:** Create `window.ts`, `window.test.ts`

- [ ] Test first: `classifyCategory("Weapons Offense")` → `{category, affinityGroup:"weapons-violence", severity:1.0}`; unknown → `affinityGroup:"unknown", severity:0.3`. `normalizeSignal(rawRow, centroids)` for each source_type: datasf (`payload.feed='datasf_sfpd_incidents'`, neighborhood from payload), camera_public (neighborhood from centroids), call_911, citizen_report; bad row (no lat) → `null`. `selectWindow(rows, now, WINDOW_HOURS)` filters by occurredAt.
- [ ] Implement `window.ts`:
  - `RawRow` = `{ id:string; sourceType:string; occurredAt:Date|string; lat:number; lng:number; payload:unknown; confidence:number|null }`.
  - `classifyCategory(raw:string)`: loop `CATEGORY_AFFINITY`, first regex match → `{category:raw||group, affinityGroup:group, severity}`; none → `{category:raw||"unknown", affinityGroup:"unknown", severity:0.3}`.
  - `sourceBucket(sourceType, feed)`: `feed==='datasf_sfpd_incidents'`→`"datasf"`; startsWith `"camera"`→`"camera"`; `"call_911"`→`"call_911"`; else `"citizen"`.
  - `normalizeSignal(r, centroids)`: zod-validate minimal shape; pull `payload.category||subcategory||description||keywords` for category text, `payload.neighborhood` else `nearestNeighborhood(lat,lng,centroids)`; `confidence ?? DEFAULT_CONFIDENCE`; `summary` = first non-empty of payload.description/summary/category + source; return `LiveSignal` or `null`.
  - `selectWindow(rows, now, hours)`: `occurredAt >= now - hours*3600e3`.
- [ ] Run test → PASS. Commit `feat(correlate): window normalization + category classify`.

---

### Task 4: `context.ts`

**Files:** Create `context.ts`, `context.test.ts`. Reuses `baseline/metrics.ts`.

- [ ] Test first: given `aggregate()` output (build via existing `metrics.aggregate` over fixture `IncidentRow[]`), `buildContexts(agg)` returns a `Map<string,NeighborhoodContext>` with `baseline30d=n.windows.d30`, `categoryRate` from `categoryMix` (category→count), `clearanceRate=n.clearance.rate`, `clearancePercentile` = rank of neighborhood in `agg.disparity.byClearance` (index/(len-1); worst clearance index 0 → percentile 1), `found=true`. `contextFor(map,"Nowhere")` → degraded `{found:false, baseline30d:0, categoryRate:{}, clearanceRate:0, clearancePercentile:0}`.
- [ ] Implement `context.ts` (`import { type AggregateResult } from "../baseline/metrics"`). `buildContexts(agg)`: iterate `agg.neighborhoods`; percentile from `agg.disparity.byClearance` order (`byClearance[0]` = lowest rate = worst → percentile 1.0; `1 - idx/(len-1)`). `contextFor(map, nbhd)` returns map value or degraded default.
- [ ] Run test → PASS. Commit `feat(correlate): neighborhood context from baseline aggregate`.

---

### Task 5: `cluster.ts`

**Files:** Create `cluster.ts`, `cluster.test.ts`

- [ ] Test first: two signals 50m/2min same affinityGroup → 1 cluster; >RADIUS_M → 2 clusters; same place but >TIME_GAP_MIN → 2; within radius, different affinityGroup → ambiguous (`category-mismatch-in-radius`); just outside radius (≤1.5×) same group → ambiguous (`category-match-near-radius`); datasf signal sharing cluster with a `call_911` within radius/time → `hasDatasfDup:true`; deterministic id stable regardless of input order.
- [ ] Implement `cluster.ts`: sort by `(occurredAt, id)`. Greedy: for each signal find open clusters where last-signal time gap ≤ TIME_GAP_MIN; among those compute min haversine to any member; if `d ≤ RADIUS_M` and same `affinityGroup` → join; if `d ≤ RADIUS_M` diff group OR `RADIUS_M < d ≤ AMBIGUOUS_RADIUS_FACTOR*RADIUS_M` same group → record `AmbiguousMerge` (default: do NOT join — adjudicator decides later); else new cluster. Cluster `id = "incident-" + fnv1a(signals.map(s=>s.id).sort().join(","))` (recompute on finalize). `neighborhood` = mode of member neighborhoods. `hasDatasfDup` = cluster has both a `datasf` and a `call_911` source member. Export `cluster(signals): { clusters: CandidateCluster[]; ambiguous: AmbiguousMerge[] }` and `fnv1a(s:string):string` (32-bit hex).
- [ ] Run test → PASS. Commit `feat(correlate): greedy space+time+category clustering`.

---

### Task 6: `adjudicate.ts` (LLM seam — mirror `calls/summarize.ts`)

**Files:** Create `adjudicate.ts`, `adjudicate.test.ts`

- [ ] Test first: `deterministicAdjudicator.resolveAmbiguous` → `"merge"` only when `distanceM ≤ AMBIGUOUS_RADIUS_FACTOR*RADIUS_M` AND reason `category-match-near-radius`, else `"split"`; `narrate` returns templated non-empty string from factors. `createAdjudicator({apiKey:undefined})` → deterministic (logged). Injected `AnthropicLike` happy path → uses model text; client throws → deterministic fallback; never throws.
- [ ] Implement mirroring `summarize.ts` exactly: `AnthropicLike` interface (copy), `DEFAULT_MODEL = "claude-haiku-4-5-20251001"`, `resolveApiKey`/`resolveModel` (env `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`), `Adjudicator` = `{ resolveAmbiguous(pair, ctx): Promise<"merge"|"split">; narrate(inc): Promise<string> }`. `narrate` system prompt: "You are a dispatch analyst. Given an incident's factor breakdown and neighborhood context, write ONE sentence (max 35 words) explaining why this dispatch rank. No preamble/markdown." `deterministicAdjudicator` templated narrate: `` `${tier}: ${sourceCount} source(s), ${affinityGroup}, ${anomalyx}× baseline, ${nbhd}${degraded?" (degraded)":""}.` ``. Any failure/no-key → deterministic; warn-log; never throws.
- [ ] Run test → PASS. Commit `feat(correlate): adjudicator seam (LLM + deterministic fallback)`.

---

### Task 7: `score.ts`

**Files:** Create `score.ts`, `score.test.ts`

- [ ] Test first: `corroboration` from distinct sources (datasf+call_911 dup counts 1.5 not 2; scaled `min(1, eff/3)`); `severity` = max member severity (+ `payload.priority` via `PRIORITY_SEVERITY` if present); `anomaly` = `min(1, (clusterCatCount/expected)-1 clamped)` where expected from `ctx.categoryRate` per ~30d (degraded `ctx.found=false` → anomaly 0, `degraded:true`); `equity` = `0.6*clearancePercentile + 0.2*recencyDecay + 0.2*meanConfidence`; composite via `WEIGHTS`; tier via `TIER_THRESHOLDS`. `rankIncidents` sorts priority desc then latest-signal desc.
- [ ] Implement `score.ts`: `scoreIncident(cluster, ctx, now): ScoredIncident` (rationale `""` placeholder filled later by pipeline), `rankIncidents(list): ScoredIncident[]`. Recency decay = `exp(-ageMin/120)` on newest signal. All constants from `config.ts`.
- [ ] Run test → PASS. Commit `feat(correlate): 4-factor priority score + ranking`.

---

### Task 8: `pages.ts` (mirror `baseline/pages.ts` shape)

**Files:** Create `pages.ts`, `pages.test.ts`

- [ ] Test first: `buildIncidentPages(ranked, now)` → one page per incident; `slug` deterministic = `cluster.id`; `type:"incident"`; `frontmatter` mirrors baseline fm shape (`kind:"incident"`, `meta:{}`, `source:"correlator"`, `samples:signalCount`, `legacy_id:slug`, `confidence:meanConf`, `created_at`, `related_gang_id:null`, `related_incident_id:null`); `tags` include `incident`, `priority:P1..P4`, `neighborhood:<slug>`, `affinity:<group>`, per-source (`source:camera` etc.), and link tag `link:baseline-datasf-sf-<nbhdslug>`; `timeline` = newline list `HH:MM SRC — summary`; `compiledTruth` markdown has tier, factor table, rationale, source list. Reuse `slugifyNeighborhood` from `../baseline/pages`.
- [ ] Implement `pages.ts`: define local `IncidentPage` (adds `timeline:string` vs baseline's `GbrainPage`). `import { slugifyNeighborhood } from "../baseline/pages"`.
- [ ] Run test → PASS. Commit `feat(correlate): incident GBrain page builder`.

---

### Task 9: `gbrain-writer.ts` (mirror `baseline/gbrain-writer.ts`)

**Files:** Create `gbrain-writer.ts`, `gbrain-writer.test.ts`

- [ ] Test first: with a fake `Db` (`execute` stub recording SQL + returning `[{id:1}]`), `writeIncidentPages(db, pages)` upserts each (assert INSERT/ON CONFLICT called), passes `timeline` (not `''`), deletes+reinserts tags, one failure → counted not thrown (`{written, failures}`).
- [ ] Implement: copy `baseline/gbrain-writer.ts` exactly; `SOURCE_ID="watchdog"`; change the INSERT `timeline` value from `''` to `${page.timeline}`; type param `IncidentPage`.
- [ ] Run test → PASS. Commit `feat(correlate): incident GBrain writer (upsert + tags + timeline)`.

---

### Task 10: `pipeline.ts` (orchestrator, DI'd — used by CLI + cron)

**Files:** Create `pipeline.ts`, `pipeline.test.ts`

- [ ] Test first: fake `Db` returning fixture rows for the two queries (datasf-baseline window + live window); injected deterministic adjudicator + fixed `now`; `runCorrelation({db, now, adjudicator, logger})` → returns `{liveSignals, clusters, ambiguousResolved, incidents, pagesWritten, byTier}` and calls writer; degraded path (no datasf rows) still produces incidents with `degraded:true`.
- [ ] Implement `pipeline.ts`: queries mirror `baseline/run.ts readDatasfRows` (datasf rows for `BASELINE_DAYS` → `IncidentRow[]` via `aggregate`) + a second select of ALL `signal_events` with `occurredAt >= now-WINDOW_HOURS`. Flow: build centroids (from datasf rows lat/lng+neighborhood) → normalize live rows → `cluster` → resolve `ambiguous` via adjudicator (merge → fold signal into cluster & recompute id) → `buildContexts(aggregate(datasf, now))` → `scoreIncident` per cluster → `rankIncidents` → `narrate` each → `buildIncidentPages` → `writeIncidentPages`. Return summary. Signature: `runCorrelation(deps: { db: Db; now: Date; adjudicator: Adjudicator; logger: Logger; windowHours?: number }): Promise<CorrelationSummary>`.
- [ ] Run test → PASS. Commit `feat(correlate): correlation pipeline orchestrator`.

---

### Task 11: `run.ts` CLI shell + package script + index export

**Files:** Create `run.ts`, `run.test.ts`; modify `packages/ingestion/package.json`, `packages/ingestion/src/index.ts`

- [ ] Test first (`run.test.ts`): `parseArgs(["--window-hours","24"])` → `{windowHours:24}`; bad → throws.
- [ ] Implement `run.ts` mirroring `baseline/run.ts`: `import "../load-env"`, `dbFromEnv`, `createLogger("correlate")`, build real adjudicator via `createAdjudicator({})`, `parseArgs`, call `runCorrelation`, log summary, `process.exitCode=1` on write failures, `import.meta` main guard.
- [ ] `package.json` scripts add: `"correlate": "tsx src/correlate/run.ts"`.
- [ ] `index.ts` add: `export { runCorrelation, type CorrelationSummary } from "./correlate/pipeline";`
- [ ] Run `pnpm --filter @caltrans/ingestion test` (full suite) + `pnpm --filter @caltrans/ingestion typecheck` → all PASS. Commit `feat(correlate): worker CLI shell + script + export`.

---

### Task 12: API mapper + route

**Files:** Create `apps/web/lib/incidents/ranked.ts`, `apps/web/lib/incidents/ranked.test.ts`, `apps/web/app/api/incidents/ranked/route.ts`

- [ ] Test first (`ranked.test.ts`, vitest): `mapPageToRankedIncident(pageRow)` parses a `type='incident'` page row (`{id,slug,title,compiled_truth,frontmatter,updated_at,tags}`) → `{ id, slug, priority, tier, neighborhood, category, sourceCount, sources, rationale }` reading tier/neighborhood/affinity/source from `tags`, `samples`/`confidence` from frontmatter; sorts via `rankComparator` (P1>P2.., then updated_at desc).
- [ ] Implement `ranked.ts` (pure). Then `route.ts`: `runtime="nodejs"`, `dynamic="force-dynamic"`; `createClient()` from `@/lib/supabase/server`; `.from("pages").select("id, slug, type, title, compiled_truth, frontmatter, updated_at, tags ( tag )").eq("source_id","watchdog").eq("type","incident").order("updated_at",{ascending:false}).limit(100)`; map + sort; return `NextResponse.json({ success:true, data })`; catch → `{ success:false, error }` 500.
- [ ] Run `pnpm --filter web test src/... ` (ranked.test.ts) → PASS; `pnpm --filter web typecheck`. Commit `feat(incidents): ranked API + pure mapper`.

---

### Task 13: cron route

**Files:** Create `apps/web/app/api/cron/correlate/route.ts`

- [ ] Implement mirroring `app/api/cron/sync-cameras/route.ts`: bearer `env.CRON_SECRET` guard, `env.DATABASE_URL` guard, `createDb(env.DATABASE_URL)`, build adjudicator via dynamic import of `@caltrans/ingestion` `runCorrelation` (+ a deterministic adjudicator import), `now=new Date()`, return summary JSON; errors → 500. (No new unit test — covered by pipeline tests; verify `pnpm --filter web typecheck`.)
- [ ] Commit `feat(cron): correlate route`.

---

### Task 14: Triage Queue UI

**Files:** Create `apps/web/app/(app)/triage/page.tsx`, `apps/web/components/triage/triage-queue.tsx`

- [ ] `page.tsx` server component (`export const dynamic = "force-dynamic"`): fetch initial data via the same supabase query as the API (reuse mapper from `@/lib/incidents/ranked`), render `<TriageQueue initial={data} />`.
- [ ] `triage-queue.tsx` client: poll `GET /api/incidents/ranked` every 15s (`setInterval`, cleanup), render ranked rows — tier badge (P1 red→P4 grey), category, neighborhood, source chips, age, one-line rationale; click row → expand factor breakdown. Mono/neutral Tailwind matching `realtime-refresh.tsx`. Empty state: "No active incidents — run `pnpm --filter @caltrans/ingestion correlate`".
- [ ] `pnpm --filter web typecheck` PASS; manual: `pnpm --filter web dev`, visit `/triage`. Commit `feat(triage): ranked incident queue UI`.

---

### Task 15: End-to-end verification

- [ ] `pnpm --filter @caltrans/ingestion test` — full suite green (75 + new).
- [ ] `pnpm --filter @caltrans/ingestion typecheck` and `pnpm --filter web typecheck` — clean.
- [ ] Live smoke: `pnpm --filter @caltrans/ingestion correlate --window-hours 720` (wide window to catch DataSF rows already in `signal_events`); confirm incident pages written (logs `pagesWritten`), then `GET /api/incidents/ranked` returns them, `/triage` renders ranked.
- [ ] Commit any fixups. Done.

---

## Self-Review

- **Spec coverage:** correlation (T5) · hybrid LLM adjudication (T6) · 4-factor deterministic score+tier (T7) · LLM rationale w/ deterministic fallback (T6+T10) · GBrain incident pages + baseline link tag + timeline (T8/T9) · ranked API (T12) · cron (T13) · triage UI w/ polling (T14) · live-window+DataSF dedupe (T3/T5) · config constants (T1) · error degradation (T6/T7/T9/T12) · tests/TDD throughout. All spec sections mapped.
- **Decisions refined vs spec (documented):** neighborhood context derived from `baseline/metrics.aggregate` (single source of truth) not GBrain-markdown parsing; baseline link via tag+frontmatter (not an unverified `links` table) — consistent with how `kg/data.ts` reads GBrain.
- **Type consistency:** `LiveSignal`/`CandidateCluster`/`NeighborhoodContext`/`ScoreFactors`/`ScoredIncident` defined once in `types.ts` (T1), consumed unchanged downstream; `IncidentPage` local to T8/T9; `Adjudicator` defined T6 used T10; `runCorrelation` signature fixed T10 used T11/T13.
- **No placeholders:** every task has concrete files, signatures, and the real algorithm; code-heavy units carry full code, others give exact signatures + the proven file they mirror verbatim.
