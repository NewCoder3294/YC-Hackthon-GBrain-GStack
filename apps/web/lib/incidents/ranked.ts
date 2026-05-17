/**
 * Pure mapping of GBrain `type='incident'` page rows (written by the
 * correlator, packages/ingestion/src/correlate) into the ranked-queue
 * view the triage UI consumes. No IO — unit-tested.
 */

export type Tier = "P1" | "P2" | "P3" | "P4";

export interface IncidentPageRow {
  id: string | number;
  slug: string;
  type: string;
  title: string;
  compiled_truth: string;
  frontmatter: Record<string, unknown> | null;
  updated_at: string;
  tags: { tag: string }[] | null;
}

export interface RankedIncident {
  id: string;
  slug: string;
  tier: Tier;
  priority: number;
  neighborhood: string;
  affinity: string;
  sources: string[];
  sourceCount: number;
  samples: number;
  confidence: number;
  lat: number;
  lng: number;
  rationale: string;
  updatedAt: string;
}

const TIER_RANK: Record<Tier, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

function tagValue(tags: readonly string[], prefix: string): string {
  const hit = tags.find((t) => t.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function asTier(v: string): Tier {
  return v === "P1" || v === "P2" || v === "P3" || v === "P4" ? v : "P4";
}

function parsePriority(title: string, body: string): number {
  // Title token is a lowercase `p0.82` (the uppercase tier `P1` must
  // NOT match), so require a lowercase p followed by a decimal.
  const t = title.match(/\bp(\d+\.\d+)/);
  if (t && t[1]) return Number(t[1]);
  const b = body.match(/\*\*Priority\*\*\s*\|\s*\*\*(\d(?:\.\d+)?)\*\*/);
  return b && b[1] ? Number(b[1]) : 0;
}

function parseRationale(body: string): string {
  for (const line of body.split("\n")) {
    const m = line.match(/^>\s+(.*)$/);
    if (m && m[1] && m[1] !== "(no rationale)") return m[1].trim();
  }
  return "";
}

export function mapPageToRankedIncident(
  row: IncidentPageRow,
): RankedIncident {
  const tags = (row.tags ?? []).map((t) => t.tag);
  const fm = row.frontmatter ?? {};
  const sources = tags
    .filter((t) => t.startsWith("source:"))
    .map((t) => t.slice("source:".length))
    .sort();
  return {
    id: String(row.id),
    slug: row.slug,
    tier: asTier(tagValue(tags, "priority:")),
    priority: parsePriority(row.title, row.compiled_truth),
    neighborhood: tagValue(tags, "neighborhood:") || "unknown",
    affinity: tagValue(tags, "affinity:") || "unknown",
    sources,
    sourceCount: sources.length,
    samples: typeof fm["samples"] === "number" ? fm["samples"] : 0,
    confidence:
      typeof fm["confidence"] === "number" ? fm["confidence"] : 0,
    lat: typeof fm["lat"] === "number" ? fm["lat"] : 0,
    lng: typeof fm["lng"] === "number" ? fm["lng"] : 0,
    rationale: parseRationale(row.compiled_truth),
    updatedAt: row.updated_at,
  };
}

/** Highest priority first; ties → tier, then most recently updated. */
export function rankComparator(
  a: RankedIncident,
  b: RankedIncident,
): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (TIER_RANK[a.tier] !== TIER_RANK[b.tier])
    return TIER_RANK[a.tier] - TIER_RANK[b.tier];
  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * A real correlator page always carries the `incident` tag and a
 * `frontmatter.source` of `correlator`. Pre-existing / seed
 * `type='incident'` GBrain pages have neither — without this guard they
 * render as "P4 · unknown · 0 src" junk in the queue.
 */
export function isCorrelatorIncident(row: IncidentPageRow): boolean {
  const taggedIncident = (row.tags ?? []).some((t) => t.tag === "incident");
  const fromCorrelator =
    (row.frontmatter ?? {})["source"] === "correlator";
  const slugShaped = row.slug.startsWith("incident-");
  return taggedIncident || fromCorrelator || slugShaped;
}

export function rankIncidentPages(
  rows: readonly IncidentPageRow[],
): RankedIncident[] {
  return rows
    .filter(isCorrelatorIncident)
    .map(mapPageToRankedIncident)
    .sort(rankComparator);
}
