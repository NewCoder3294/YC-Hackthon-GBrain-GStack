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

interface TitleParts {
  tier?: Tier;
  affinity?: string;
  neighborhood?: string;
  samples?: number;
  priority?: number;
}

/**
 * The correlator title is self-describing and ALWAYS returned with the
 * page row:  "P3 · unknown · Mission Bay · 1 signal(s) · p0.29".
 * The `tags` relationship embed is not always returned (depends on the
 * Supabase role/RLS in the deployed env), so the title — not tags — is
 * the source of truth for tier/affinity/neighborhood/samples/priority.
 */
function parseTitle(title: string): TitleParts {
  const parts = title.split("·").map((s) => s.trim());
  const out: TitleParts = {};
  if (parts[0] && /^P[1-4]$/.test(parts[0])) out.tier = parts[0] as Tier;
  if (parts[1] && parts[1].length > 0) out.affinity = parts[1];
  if (parts[2] && parts[2].length > 0) out.neighborhood = parts[2];
  const sig = parts.find((p) => /signal\(s\)/.test(p));
  if (sig) {
    const n = parseInt(sig, 10);
    if (Number.isFinite(n)) out.samples = n;
  }
  const pm = title.match(/\bp(\d+(?:\.\d+)?)/);
  if (pm && pm[1]) out.priority = Number(pm[1]);
  return out;
}

export function mapPageToRankedIncident(
  row: IncidentPageRow,
): RankedIncident {
  const tags = (row.tags ?? []).map((t) => t.tag);
  const fm = row.frontmatter ?? {};
  const t = parseTitle(row.title);
  // Title is the source of truth (always present); tags only enrich
  // the per-source list when the embed is available.
  const sources = tags
    .filter((s) => s.startsWith("source:"))
    .map((s) => s.slice("source:".length))
    .sort();
  const samples =
    typeof fm["samples"] === "number" ? fm["samples"] : (t.samples ?? 0);
  return {
    id: String(row.id),
    slug: row.slug,
    tier: asTier(t.tier ?? tagValue(tags, "priority:")),
    priority:
      t.priority ?? parsePriority(row.title, row.compiled_truth),
    neighborhood:
      t.neighborhood || tagValue(tags, "neighborhood:") || "unknown",
    affinity: t.affinity || tagValue(tags, "affinity:") || "unknown",
    sources,
    sourceCount: sources.length > 0 ? sources.length : samples,
    samples,
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
 * render as "P4 · unknown · 0 src" junk in the queue. We also require a
 * `priority:` tag, because legacy seed pages can match the slug or tag
 * markers but have no metadata, which surfaced as the same junk row.
 */
export function isCorrelatorIncident(row: IncidentPageRow): boolean {
  const tags = (row.tags ?? []).map((t) => t.tag);
  const taggedIncident = tags.includes("incident");
  const fromCorrelator =
    (row.frontmatter ?? {})["source"] === "correlator";
  const hasPriorityTag = tags.some((t) => t.startsWith("priority:"));
  return (taggedIncident || fromCorrelator) && hasPriorityTag;
}

export function rankIncidentPages(
  rows: readonly IncidentPageRow[],
): RankedIncident[] {
  return rows
    .filter(isCorrelatorIncident)
    .map(mapPageToRankedIncident)
    .sort(rankComparator);
}
