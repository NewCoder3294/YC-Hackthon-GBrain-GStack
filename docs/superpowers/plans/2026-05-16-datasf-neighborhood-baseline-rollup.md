# DataSF → GBrain Neighborhood-Baseline Rollup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ingested DataSF rows in `signal_events` into GBrain
`baseline`/`pattern` pages so the existing KG + `gbrain_search` surface
real per-neighborhood SF crime baselines.

**Architecture:** New producer-style module `packages/ingestion/src/baseline/`.
Pure aggregation (`metrics.ts`) and pure page-building (`pages.ts`) are
TDD'd; thin IO (`gbrain-writer.ts`, `run.ts`) is typecheck + manual-run
gated. Reads `signal_events WHERE payload->>'feed' =
'datasf_sfpd_incidents'`; upserts GBrain `pages`+`tags` over the same
`DATABASE_URL` (`UNIQUE (source_id, slug)`; FTS auto-indexed by the
`trg_pages_search_vector` trigger).

**Tech Stack:** TypeScript (strict), `@caltrans/db` (Drizzle/postgres),
`drizzle-orm`, vitest, tsx. No new dependencies.

Spec: `docs/superpowers/specs/2026-05-16-datasf-neighborhood-baseline-rollup-design.md`

---

### Task 1: Pure metrics aggregation

**Files:**
- Create: `packages/ingestion/src/baseline/metrics.ts`
- Test: `packages/ingestion/src/baseline/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion/src/baseline/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregate, type IncidentRow } from "./metrics";

const NOW = new Date("2026-05-16T00:00:00.000Z");
const daysAgo = (d: number) =>
  new Date(NOW.getTime() - d * 86_400_000).toISOString();

function row(p: Partial<IncidentRow> & { neighborhood: string }): IncidentRow {
  return {
    occurredAt: p.occurredAt ?? daysAgo(1),
    neighborhood: p.neighborhood,
    category: p.category ?? "Larceny Theft",
    resolution: p.resolution ?? "Open or Active",
  };
}

describe("aggregate", () => {
  it("counts per neighborhood across time windows", () => {
    const rows: IncidentRow[] = [
      row({ neighborhood: "Mission", occurredAt: daysAgo(2) }),
      row({ neighborhood: "Mission", occurredAt: daysAgo(20) }),
      row({ neighborhood: "Mission", occurredAt: daysAgo(200) }),
      row({ neighborhood: "SOMA", occurredAt: daysAgo(3) }),
    ];
    const { neighborhoods } = aggregate(rows, NOW);
    const m = neighborhoods.find((n) => n.neighborhood === "Mission")!;
    expect(m.total).toBe(3);
    expect(m.windows.d7).toBe(1);
    expect(m.windows.d30).toBe(2);
    expect(m.windows.d90).toBe(2);
    expect(m.windows.d365).toBe(3);
  });

  it("computes 30d-vs-prior-30d trend percent", () => {
    const rows: IncidentRow[] = [
      row({ neighborhood: "Mission", occurredAt: daysAgo(5) }),
      row({ neighborhood: "Mission", occurredAt: daysAgo(10) }),
      row({ neighborhood: "Mission", occurredAt: daysAgo(40) }),
    ];
    const { neighborhoods } = aggregate(rows, NOW);
    const m = neighborhoods.find((n) => n.neighborhood === "Mission")!;
    // current30 = 2, prior30 = 1 → +100%
    expect(m.trendPct).toBe(100);
  });

  it("buckets resolution into clearance rate", () => {
    const rows: IncidentRow[] = [
      row({ neighborhood: "Mission", resolution: "Cite or Arrest Adult" }),
      row({ neighborhood: "Mission", resolution: "Exceptional Adult" }),
      row({ neighborhood: "Mission", resolution: "Open or Active" }),
      row({ neighborhood: "Mission", resolution: "Unfounded" }),
    ];
    const { neighborhoods } = aggregate(rows, NOW);
    const m = neighborhoods.find((n) => n.neighborhood === "Mission")!;
    expect(m.clearance.enforcement).toBe(2);
    expect(m.clearance.unfounded).toBe(1);
    expect(m.clearance.open).toBe(1);
    expect(m.clearance.rate).toBeCloseTo(0.5);
  });

  it("ranks top-5 category mix by count", () => {
    const rows: IncidentRow[] = [
      ...Array(3).fill(0).map(() => row({ neighborhood: "M", category: "Assault" })),
      ...Array(2).fill(0).map(() => row({ neighborhood: "M", category: "Burglary" })),
      row({ neighborhood: "M", category: "Arson" }),
    ];
    const { neighborhoods } = aggregate(rows, NOW);
    const m = neighborhoods.find((n) => n.neighborhood === "M")!;
    expect(m.categoryMix[0]).toMatchObject({ category: "Assault", count: 3 });
    expect(m.categoryMix.length).toBeLessThanOrEqual(5);
    expect(m.categoryMix[0]!.sharePct).toBeCloseTo(50);
  });

  it("buckets blank/null neighborhood as Unknown and excludes from ranked", () => {
    const rows: IncidentRow[] = [
      row({ neighborhood: "" }),
      row({ neighborhood: "Mission" }),
    ];
    const { neighborhoods, unknownCount } = aggregate(rows, NOW);
    expect(unknownCount).toBe(1);
    expect(neighborhoods.map((n) => n.neighborhood)).toEqual(["Mission"]);
  });

  it("computes disparity ranking + spread across all neighborhoods", () => {
    const rows: IncidentRow[] = [
      ...Array(10).fill(0).map(() => row({ neighborhood: "HighVol", resolution: "Open or Active" })),
      ...Array(2).fill(0).map(() => row({ neighborhood: "LowVol", resolution: "Cite or Arrest Adult" })),
    ];
    const { disparity } = aggregate(rows, NOW);
    expect(disparity.byVolume[0]!.neighborhood).toBe("HighVol");
    // byClearance ascending = lowest clearance first (equity lens;
    // pages.ts reads [0] as "Lowest clearance"). HighVol = 0% cleared.
    expect(disparity.byClearance[0]!.neighborhood).toBe("HighVol");
    expect(disparity.byClearance[0]!.rate).toBe(0);
    expect(disparity.volumeSpreadRatio).toBe(5); // 10 / 2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caltrans/ingestion exec vitest run src/baseline/metrics.test.ts`
Expected: FAIL — `Cannot find module './metrics'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ingestion/src/baseline/metrics.ts`:

```ts
/**
 * Pure aggregation of DataSF incidents → per-neighborhood baselines +
 * a cross-neighborhood disparity proxy. No IO — fully unit-testable
 * (mirrors calls/generator.ts).
 *
 * Disparity is a PROXY equity signal from reported-incident volume +
 * clearance only. It is NOT the TRD under-policing (reports/responses)
 * or indiscriminate (stops/incidents) ratio — those need dispatch /
 * stop data this system does not have.
 */

export interface IncidentRow {
  occurredAt: string; // ISO (signal_events.occurred_at)
  neighborhood: string; // payload.neighborhood ("" / null → Unknown)
  category: string; // payload.category
  resolution: string; // payload.resolution
}

export interface CategoryShare {
  category: string;
  count: number;
  sharePct: number;
}

export interface Clearance {
  enforcement: number;
  unfounded: number;
  open: number;
  rate: number; // enforcement / total
}

export interface NeighborhoodBaseline {
  neighborhood: string;
  total: number;
  windows: { d7: number; d30: number; d90: number; d365: number };
  trendPct: number; // current 30d vs prior 30d, signed %
  categoryMix: CategoryShare[];
  clearance: Clearance;
}

export interface Disparity {
  byVolume: { neighborhood: string; total: number }[];
  byClearance: { neighborhood: string; rate: number }[];
  volumeSpreadRatio: number; // max total / min total (>=1, 0 if <2 nbhds)
}

export interface AggregateResult {
  neighborhoods: NeighborhoodBaseline[]; // ranked by total desc
  disparity: Disparity;
  unknownCount: number;
  totalIncidents: number;
}

const ENFORCEMENT = new Set([
  "Cite or Arrest Adult",
  "Cite or Arrest Juvenile",
  "Exceptional Adult",
  "Exceptional Juvenile",
]);
const UNFOUNDED = new Set(["Unfounded"]);

function classify(res: string): "enforcement" | "unfounded" | "open" {
  if (ENFORCEMENT.has(res)) return "enforcement";
  if (UNFOUNDED.has(res)) return "unfounded";
  return "open";
}

function within(occurredMs: number, nowMs: number, days: number): boolean {
  return occurredMs >= nowMs - days * 86_400_000 && occurredMs <= nowMs;
}

export function aggregate(
  rows: readonly IncidentRow[],
  now: Date,
): AggregateResult {
  const nowMs = now.getTime();
  const byNbhd = new Map<string, IncidentRow[]>();
  let unknownCount = 0;

  for (const r of rows) {
    const nb = r.neighborhood.trim();
    if (nb.length === 0) {
      unknownCount += 1;
      continue;
    }
    const list = byNbhd.get(nb) ?? [];
    list.push(r);
    byNbhd.set(nb, list);
  }

  const neighborhoods: NeighborhoodBaseline[] = [];
  for (const [neighborhood, list] of byNbhd) {
    const times = list.map((r) => new Date(r.occurredAt).getTime());
    const win = (d: number) =>
      times.filter((t) => within(t, nowMs, d)).length;

    const current30 = win(30);
    const prior30 = times.filter(
      (t) =>
        t >= nowMs - 60 * 86_400_000 && t < nowMs - 30 * 86_400_000,
    ).length;
    const trendPct =
      prior30 === 0
        ? current30 > 0
          ? 100
          : 0
        : Math.round(((current30 - prior30) / prior30) * 100);

    const catCounts = new Map<string, number>();
    for (const r of list) {
      catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
    }
    const total = list.length;
    const categoryMix: CategoryShare[] = [...catCounts.entries()]
      .map(([category, count]) => ({
        category,
        count,
        sharePct: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
      .slice(0, 5);

    let enforcement = 0;
    let unfounded = 0;
    let open = 0;
    for (const r of list) {
      const c = classify(r.resolution);
      if (c === "enforcement") enforcement += 1;
      else if (c === "unfounded") unfounded += 1;
      else open += 1;
    }

    neighborhoods.push({
      neighborhood,
      total,
      windows: { d7: win(7), d30: win(30), d90: win(90), d365: win(365) },
      trendPct,
      categoryMix,
      clearance: {
        enforcement,
        unfounded,
        open,
        rate: total === 0 ? 0 : enforcement / total,
      },
    });
  }

  neighborhoods.sort(
    (a, b) => b.total - a.total || a.neighborhood.localeCompare(b.neighborhood),
  );

  const byVolume = neighborhoods.map((n) => ({
    neighborhood: n.neighborhood,
    total: n.total,
  }));
  const byClearance = [...neighborhoods]
    .sort(
      (a, b) =>
        a.clearance.rate - b.clearance.rate ||
        a.neighborhood.localeCompare(b.neighborhood),
    )
    .map((n) => ({ neighborhood: n.neighborhood, rate: n.clearance.rate }));
  const totals = byVolume.map((v) => v.total);
  const volumeSpreadRatio =
    totals.length < 2 || Math.min(...totals) === 0
      ? 0
      : Math.max(...totals) / Math.min(...totals);

  return {
    neighborhoods,
    disparity: { byVolume, byClearance, volumeSpreadRatio },
    unknownCount,
    totalIncidents: rows.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caltrans/ingestion exec vitest run src/baseline/metrics.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ingestion/src/baseline/metrics.ts packages/ingestion/src/baseline/metrics.test.ts
git commit -m "feat(baseline): pure DataSF→neighborhood metrics aggregation + disparity"
```

---

### Task 2: Pure GBrain page builder

**Files:**
- Create: `packages/ingestion/src/baseline/pages.ts`
- Test: `packages/ingestion/src/baseline/pages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ingestion/src/baseline/pages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPages, slugifyNeighborhood, type GbrainPage } from "./pages";
import { aggregate, type IncidentRow } from "./metrics";

const NOW = new Date("2026-05-16T00:00:00.000Z");

function rows(): IncidentRow[] {
  const r: IncidentRow[] = [];
  for (let i = 0; i < 12; i += 1)
    r.push({
      occurredAt: new Date(NOW.getTime() - i * 86_400_000).toISOString(),
      neighborhood: "Mission",
      category: "Assault",
      resolution: i % 3 === 0 ? "Cite or Arrest Adult" : "Open or Active",
    });
  r.push({
    occurredAt: NOW.toISOString(),
    neighborhood: "Bayview Hunters Point",
    category: "Robbery",
    resolution: "Open or Active",
  });
  return r;
}

describe("slugifyNeighborhood", () => {
  it("lowercases and dash-separates", () => {
    expect(slugifyNeighborhood("Bayview Hunters Point")).toBe(
      "bayview-hunters-point",
    );
    expect(slugifyNeighborhood("  Mission  ")).toBe("mission");
  });
});

describe("buildPages", () => {
  const agg = aggregate(rows(), NOW);
  const pages: GbrainPage[] = buildPages(agg, NOW, 10);

  it("emits top-N baseline pages + rollup + disparity", () => {
    const slugs = pages.map((p) => p.slug);
    expect(slugs).toContain("baseline-datasf-sf-mission");
    expect(slugs).toContain("baseline-datasf-sf-rollup");
    expect(slugs).toContain("pattern-datasf-sf-neighborhood-disparity");
  });

  it("baseline page has the exact seeded frontmatter shape", () => {
    const p = pages.find((x) => x.slug === "baseline-datasf-sf-mission")!;
    expect(p.type).toBe("baseline");
    expect(p.frontmatter).toMatchObject({
      kind: "baseline",
      meta: {},
      source: "datasf",
      confidence: 1.0,
      related_gang_id: null,
      related_incident_id: null,
      legacy_id: "datasf-baseline-sf-mission",
    });
    expect(p.frontmatter.samples).toBe(12);
    expect(typeof p.frontmatter.created_at).toBe("string");
    expect(p.tags).toContain("baseline:mission");
    expect(p.tags).toContain("feed:datasf_sfpd_incidents");
    expect(p.tags).toContain("source:datasf");
  });

  it("disparity page is type=pattern with the proxy caption", () => {
    const p = pages.find(
      (x) => x.slug === "pattern-datasf-sf-neighborhood-disparity",
    )!;
    expect(p.type).toBe("pattern");
    expect(p.frontmatter.kind).toBe("pattern");
    expect(p.compiledTruth).toContain("Proxy equity signal");
    expect(p.compiledTruth).toContain("NOT");
    expect(p.tags).toContain("trend:neighborhood-disparity");
  });

  it("is deterministic (same input → identical output)", () => {
    const a = buildPages(agg, NOW, 10);
    const b = buildPages(agg, NOW, 10);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("writes one page per neighborhood when fewer than N have data", () => {
    const small = aggregate(
      [
        {
          occurredAt: NOW.toISOString(),
          neighborhood: "Mission",
          category: "Assault",
          resolution: "Open or Active",
        },
      ],
      NOW,
    );
    const ps = buildPages(small, NOW, 10);
    const baselineNbhd = ps.filter(
      (p) => p.type === "baseline" && p.slug !== "baseline-datasf-sf-rollup",
    );
    expect(baselineNbhd).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caltrans/ingestion exec vitest run src/baseline/pages.test.ts`
Expected: FAIL — `Cannot find module './pages'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ingestion/src/baseline/pages.ts`:

```ts
/**
 * Pure builder: aggregates → GBrain page objects matching the exact
 * shape of the seeded `type='baseline'` rows (verified live:
 * page_kind='markdown', timeline='', frontmatter {kind,meta,source,
 * samples,legacy_id,confidence,created_at,related_gang_id,
 * related_incident_id}). No IO — unit-testable.
 */

import type { AggregateResult, NeighborhoodBaseline } from "./metrics";

export interface GbrainFrontmatter {
  kind: "baseline" | "pattern";
  meta: Record<string, never>;
  source: "datasf";
  samples: number;
  legacy_id: string;
  confidence: number;
  created_at: string;
  related_gang_id: null;
  related_incident_id: null;
}

export interface GbrainPage {
  slug: string;
  type: "baseline" | "pattern";
  title: string;
  compiledTruth: string;
  frontmatter: GbrainFrontmatter;
  tags: string[];
}

export const DISPARITY_CAPTION =
  "Proxy equity signal derived from reported-incident volume + clearance " +
  "outcomes only. This is NOT the under-policing (reports/responses) or " +
  "indiscriminate (stops/incidents) ratio — those require dispatch-response " +
  "and stop data this system does not have. Treat as a starting lens, not " +
  "a conclusion.";

export function slugifyNeighborhood(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fm(
  kind: "baseline" | "pattern",
  legacyId: string,
  samples: number,
  createdAt: string,
): GbrainFrontmatter {
  return {
    kind,
    meta: {},
    source: "datasf",
    samples,
    legacy_id: legacyId,
    confidence: 1.0,
    created_at: createdAt,
    related_gang_id: null,
    related_incident_id: null,
  };
}

function arrow(pct: number): string {
  if (pct > 0) return `▲${pct}%`;
  if (pct < 0) return `▼${Math.abs(pct)}%`;
  return "→0%";
}

function neighborhoodBody(n: NeighborhoodBaseline): string {
  const cats = n.categoryMix
    .map((c) => `- ${c.category}: ${c.count} (${c.sharePct}%)`)
    .join("\n");
  return [
    `Real SFPD incident baseline for **${n.neighborhood}** (DataSF, ` +
      `confirmed reports).`,
    "",
    `**Windows:** 7d ${n.windows.d7} · 30d ${n.windows.d30} · 90d ` +
      `${n.windows.d90} · 365d ${n.windows.d365}`,
    `**Trend:** ${arrow(n.trendPct)} (current 30d vs prior 30d)`,
    `**Clearance:** ${n.clearance.enforcement} enforcement · ` +
      `${n.clearance.unfounded} unfounded · ${n.clearance.open} open ` +
      `→ rate ${(n.clearance.rate * 100).toFixed(1)}%`,
    "",
    "**Top categories:**",
    cats,
  ].join("\n");
}

export function buildPages(
  agg: AggregateResult,
  now: Date,
  topN: number,
): GbrainPage[] {
  const createdAt = now.toISOString();
  const pages: GbrainPage[] = [];

  const top = agg.neighborhoods.slice(0, topN);
  for (const n of top) {
    const s = slugifyNeighborhood(n.neighborhood);
    pages.push({
      slug: `baseline-datasf-sf-${s}`,
      type: "baseline",
      title:
        `${n.neighborhood} · ${n.total} incidents · ` +
        `${(n.clearance.rate * 100).toFixed(0)}% cleared · ` +
        `${arrow(n.trendPct)} 30d`,
      compiledTruth: neighborhoodBody(n),
      frontmatter: fm(
        "baseline",
        `datasf-baseline-sf-${s}`,
        n.total,
        createdAt,
      ),
      tags: [
        `baseline:${s}`,
        "feed:datasf_sfpd_incidents",
        "source:datasf",
      ],
    });
  }

  const rollupRows = agg.neighborhoods
    .map(
      (n) =>
        `| ${n.neighborhood} | ${n.total} | ${n.windows.d30} | ` +
        `${arrow(n.trendPct)} | ${(n.clearance.rate * 100).toFixed(1)}% |`,
    )
    .join("\n");
  pages.push({
    slug: "baseline-datasf-sf-rollup",
    type: "baseline",
    title: `SF DataSF baseline · ${agg.neighborhoods.length} neighborhoods · ${agg.totalIncidents} incidents`,
    compiledTruth: [
      "SF-wide real SFPD incident baseline (DataSF). All neighborhoods.",
      "",
      "| Neighborhood | Total | 30d | Trend | Clearance |",
      "|---|---|---|---|---|",
      rollupRows,
      "",
      `Unknown/anonymized-neighborhood rows excluded: ${agg.unknownCount}.`,
    ].join("\n"),
    frontmatter: fm(
      "baseline",
      "datasf-baseline-sf-rollup",
      agg.totalIncidents,
      createdAt,
    ),
    tags: ["baseline:sf-rollup", "feed:datasf_sfpd_incidents", "source:datasf"],
  });

  const volTop = agg.disparity.byVolume[0];
  const clrLow = agg.disparity.byClearance[0];
  pages.push({
    slug: "pattern-datasf-sf-neighborhood-disparity",
    type: "pattern",
    title: `SF neighborhood disparity · volume spread ${agg.disparity.volumeSpreadRatio.toFixed(1)}×`,
    compiledTruth: [
      "Cross-neighborhood disparity from real DataSF incidents.",
      "",
      `**Highest volume:** ${volTop ? `${volTop.neighborhood} (${volTop.total})` : "—"}`,
      `**Lowest clearance:** ${clrLow ? `${clrLow.neighborhood} (${(clrLow.rate * 100).toFixed(1)}%)` : "—"}`,
      `**Volume spread (max/min):** ${agg.disparity.volumeSpreadRatio.toFixed(1)}×`,
      "",
      `> ${DISPARITY_CAPTION}`,
    ].join("\n"),
    frontmatter: fm(
      "pattern",
      "datasf-pattern-sf-neighborhood-disparity",
      agg.totalIncidents,
      createdAt,
    ),
    tags: [
      "trend:neighborhood-disparity",
      "feed:datasf_sfpd_incidents",
      "source:datasf",
    ],
  });

  return pages;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caltrans/ingestion exec vitest run src/baseline/pages.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ingestion/src/baseline/pages.ts packages/ingestion/src/baseline/pages.test.ts
git commit -m "feat(baseline): pure GBrain page builder (baseline/rollup/disparity)"
```

---

### Task 3: GBrain writer (IO — upsert pages + tags)

**Files:**
- Create: `packages/ingestion/src/baseline/gbrain-writer.ts`

- [ ] **Step 1: Write the implementation**

Create `packages/ingestion/src/baseline/gbrain-writer.ts`:

```ts
/**
 * IO: upsert GBrain `pages` + replace child `tags` over the same
 * Postgres `DATABASE_URL` the ingestion uses. Verified live:
 * UNIQUE (source_id, slug); id from pages_id_seq; page_kind='markdown';
 * timeline=''; search_vector auto-filled by trg_pages_search_vector.
 */

import { sql } from "drizzle-orm";
import type { Db } from "@caltrans/db";
import type { GbrainPage } from "./pages";

const SOURCE_ID = "watchdog";

export interface WriteResult {
  written: number;
  failures: { slug: string; message: string }[];
}

async function upsertOne(db: Db, page: GbrainPage): Promise<void> {
  const fmJson = JSON.stringify(page.frontmatter);
  const rows = await db.execute<{ id: number }>(sql`
    INSERT INTO pages
      (source_id, slug, type, page_kind, title, compiled_truth,
       timeline, frontmatter, created_at, updated_at)
    VALUES
      (${SOURCE_ID}, ${page.slug}, ${page.type}, 'markdown',
       ${page.title}, ${page.compiledTruth}, '',
       ${fmJson}::jsonb, now(), now())
    ON CONFLICT (source_id, slug) DO UPDATE SET
      type = EXCLUDED.type,
      title = EXCLUDED.title,
      compiled_truth = EXCLUDED.compiled_truth,
      frontmatter = EXCLUDED.frontmatter,
      updated_at = now()
    RETURNING id
  `);
  const id = (rows as unknown as { id: number }[])[0]?.id;
  if (id === undefined) throw new Error(`no id returned for ${page.slug}`);

  await db.execute(sql`DELETE FROM tags WHERE page_id = ${id}`);
  for (const tag of page.tags) {
    await db.execute(
      sql`INSERT INTO tags (page_id, tag) VALUES (${id}, ${tag})`,
    );
  }
}

/** Upsert each page; one failure never aborts the rest. */
export async function writePages(
  db: Db,
  pages: readonly GbrainPage[],
): Promise<WriteResult> {
  const failures: { slug: string; message: string }[] = [];
  let written = 0;
  for (const page of pages) {
    try {
      await upsertOne(db, page);
      written += 1;
    } catch (err: unknown) {
      failures.push({
        slug: page.slug,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { written, failures };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @caltrans/ingestion typecheck`
Expected: PASS (no output / exit 0). If `db.execute` generic mismatch,
adjust the cast to `(rows as unknown as { id: number }[])` only — do not
change the SQL.

- [ ] **Step 3: Commit**

```bash
git add packages/ingestion/src/baseline/gbrain-writer.ts
git commit -m "feat(baseline): GBrain pages/tags upsert writer (ON CONFLICT source_id,slug)"
```

---

### Task 4: Worker IO shell + script wiring

**Files:**
- Create: `packages/ingestion/src/baseline/run.ts`
- Modify: `packages/ingestion/package.json` (add `baseline` script)

- [ ] **Step 1: Write the implementation**

Create `packages/ingestion/src/baseline/run.ts`:

```ts
/**
 * Neighborhood-baseline rollup worker.
 *
 *   pnpm --filter @caltrans/ingestion baseline [--days N] [--top N]
 *
 * Reads datasf rows from signal_events (payload.feed =
 * 'datasf_sfpd_incidents'), aggregates per analysis_neighborhood, and
 * upserts GBrain baseline/rollup/disparity pages. IO shell only — logic
 * is in metrics.ts / pages.ts (mirrors datasf/run.ts).
 */

import "../load-env";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { signalEvents, type Db } from "@caltrans/db";
import { dbFromEnv } from "../db";
import { createLogger } from "../logger";
import { aggregate, type IncidentRow } from "./metrics";
import { buildPages } from "./pages";
import { writePages } from "./gbrain-writer";

const log = createLogger("baseline");

interface CliArgs {
  daysBack: number;
  topN: number;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const num = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    if (i === -1) return fallback;
    const n = Number(argv[i + 1]);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`${flag} requires a positive number`);
    }
    return n;
  };
  return { daysBack: num("--days", 400), topN: num("--top", 10) };
}

function toIncidentRow(p: unknown, occurredAt: Date): IncidentRow | null {
  if (typeof p !== "object" || p === null) return null;
  const o = p as Record<string, unknown>;
  if (o["feed"] !== "datasf_sfpd_incidents") return null;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    occurredAt: occurredAt.toISOString(),
    neighborhood: str(o["neighborhood"]),
    category: str(o["category"]),
    resolution: str(o["resolution"]),
  };
}

async function readDatasfRows(
  db: Db,
  daysBack: number,
): Promise<IncidentRow[]> {
  const since = new Date(Date.now() - daysBack * 86_400_000);
  const rows = await db
    .select({
      occurredAt: signalEvents.occurredAt,
      payload: signalEvents.payload,
    })
    .from(signalEvents)
    .where(
      sql`${signalEvents.sourceType} = 'call_911'
          AND ${signalEvents.payload}->>'feed' = 'datasf_sfpd_incidents'
          AND ${signalEvents.occurredAt} >= ${since.toISOString()}`,
    );
  const out: IncidentRow[] = [];
  for (const r of rows) {
    const ir = toIncidentRow(r.payload, new Date(r.occurredAt));
    if (ir !== null) out.push(ir);
  }
  return out;
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err: unknown) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const db = dbFromEnv();

  let rows: IncidentRow[];
  try {
    rows = await readDatasfRows(db, args.daysBack);
  } catch (err: unknown) {
    log.error("Failed reading signal_events", {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
    return;
  }

  if (rows.length === 0) {
    log.info(
      "No datasf rows in signal_events — run " +
        "`pnpm --filter @caltrans/ingestion datasf --backfill` first",
    );
    return;
  }

  const agg = aggregate(rows, now);
  const pages = buildPages(agg, now, args.topN);
  log.info("Aggregated", {
    incidents: agg.totalIncidents,
    neighborhoods: agg.neighborhoods.length,
    unknown: agg.unknownCount,
    pages: pages.length,
  });

  const res = await writePages(db, pages);
  log.info("Baseline rollup complete", {
    pagesWritten: res.written,
    failures: res.failures.length,
    failed: res.failures,
  });
  if (res.failures.length > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined) {
  const thisFile = fileURLToPath(import.meta.url);
  if (resolve(invokedPath) === thisFile) {
    void main();
  }
}
```

- [ ] **Step 2: Add the package script**

In `packages/ingestion/package.json`, in `"scripts"`, add the `baseline`
line directly after the `"datasf"` line:

```json
    "datasf": "tsx src/datasf/run.ts",
    "baseline": "tsx src/baseline/run.ts",
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @caltrans/ingestion typecheck`
Expected: PASS (exit 0).

- [ ] **Step 4: Commit**

```bash
git add packages/ingestion/src/baseline/run.ts packages/ingestion/package.json
git commit -m "feat(baseline): worker IO shell + baseline script wiring"
```

---

### Task 5: Full verification + live run

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + test**

Run: `pnpm --filter @caltrans/ingestion typecheck && pnpm --filter @caltrans/ingestion test`
Expected: typecheck exit 0; all tests pass including the new
`baseline/metrics.test.ts` (6) and `baseline/pages.test.ts` (6).

- [ ] **Step 2: Ensure datasf data exists, then run the rollup live**

Run:
```bash
pnpm --filter @caltrans/ingestion db:stats
# if camera_public/call_911 counts show no datasf feed yet:
pnpm --filter @caltrans/ingestion datasf --recent
pnpm --filter @caltrans/ingestion baseline
```
Expected: `baseline` logs `Aggregated {incidents,neighborhoods,pages}`
then `Baseline rollup complete {pagesWritten: >0, failures: 0}`.

- [ ] **Step 3: Verify pages landed in GBrain**

Run:
```bash
pnpm --filter @caltrans/ingestion exec tsx -e '
import("dotenv").then((d)=>{d.config({path:process.cwd()+"/apps/web/.env.local"});return Promise.all([import("@caltrans/db"),import("drizzle-orm")]);}).then(async([{createDb},{sql}])=>{const db=createDb(process.env.DATABASE_URL);const r=await db.execute(sql.raw("select slug,type from pages where source_id=\047watchdog\047 and slug like \047%datasf%\047 order by slug"));console.log(JSON.stringify(r));process.exit(0);}).catch((e)=>{console.error(e.message);process.exit(1);});'
```
Expected: rows for `baseline-datasf-sf-*`, `baseline-datasf-sf-rollup`,
`pattern-datasf-sf-neighborhood-disparity`. (These now render in the KG
and are returned by `gbrain_search`.)

- [ ] **Step 4: Idempotency check**

Run: `pnpm --filter @caltrans/ingestion baseline` again, then re-run the
Step 3 query.
Expected: same slugs, no duplicates (upsert by `(source_id, slug)`),
`pagesWritten` equal to the first run.

- [ ] **Step 5: Final commit (if any uncommitted verification tweaks)**

```bash
git status --porcelain
# only commit intended files if the prior tasks left anything staged:
git commit -m "chore(baseline): verification pass" --allow-empty
```

---

## Self-Review

**1. Spec coverage:**
- §1 architecture → Tasks 1–4 (module, pure/IO split, same DATABASE_URL). ✓
- §2 components → metrics(T1), pages(T2), gbrain-writer(T3), run+pkg(T4), tests(T1/T2). ✓
- §3 metrics (windows/trend/category/clearance/disparity + caption) → T1 + DISPARITY_CAPTION in T2. ✓
- §4 GBrain page contract (page_kind='markdown', timeline='', exact frontmatter, slug namespace, top-10+rollup+disparity, type=pattern for disparity) → T2 + T3. ✓
- §5 idempotency (UNIQUE(source_id,slug) upsert + tag replace) → T3 + T5 step 4. ✓
- §6 error handling (no rows → exit 0; per-page try/catch; DB fail → exit 1) → T4 + T3. ✓
- §7 testing (pure TDD; IO typecheck+manual) → T1/T2 TDD, T3/T4 typecheck, T5 live. ✓
- §8 scope (no cron/embeddings/UI/real-ratio) → nothing added beyond scope. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code;
commands have expected output. ✓

**3. Type consistency:** `IncidentRow`, `AggregateResult`,
`NeighborhoodBaseline`, `Disparity` (T1) consumed unchanged by `pages.ts`
(T2); `GbrainPage`/`GbrainFrontmatter` (T2) consumed unchanged by
`gbrain-writer.ts` (T3) and `run.ts` (T4); `Db` from `@caltrans/db` used
consistently; `aggregate`/`buildPages`/`writePages`/`parseArgs` signatures
match call sites. ✓
