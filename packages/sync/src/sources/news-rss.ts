// SF crime-news RSS ingester.
//
// Writes to `news_incidents`, not `live_incidents`. The schema requires
// non-null lat/lng so we geocode each article by scanning its title +
// summary for a known SF neighborhood name and falling back to the
// neighborhood centroid (geo_precision is implicit because the news
// table doesn't track precision -- the centroid stand-in is documented
// at the feed level in the cockpit).
//
// Feeds we ingest (all public, no auth):
//   - Mission Local       -- https://missionlocal.org/feed/
//   - SF Standard         -- https://sfstandard.com/feed/
//   - SFist               -- https://sfist.com/feed/
//   - SFPD press releases -- https://www.sanfranciscopolice.org/news/feed
//
// Polled every 30 min. Per-article dedup is on `source_url` (the table
// has a unique index where source_url is not null).

import type { NewNewsIncident } from "@caltrans/db";
import {
  SF_NEIGHBORHOOD_CENTROIDS,
  lookupNeighborhoodCentroid,
} from "../sf-neighborhoods";

export const NEWS_RSS_SOURCE = "news_rss";

export interface RssFeedDef {
  /** Human-readable source label stored on each row. */
  source: string;
  /** Feed URL. */
  url: string;
}

export const DEFAULT_NEWS_FEEDS: RssFeedDef[] = [
  { source: "Mission Local", url: "https://missionlocal.org/feed/" },
  { source: "SF Standard", url: "https://sfstandard.com/feed/" },
  { source: "SFist", url: "https://sfist.com/feed/" },
  {
    source: "SFPD",
    url: "https://www.sanfranciscopolice.org/news/feed",
  },
];

export interface NewsRssDeps {
  fetch: typeof globalThis.fetch;
  /** Override the default feed list (tests). */
  feeds?: RssFeedDef[];
  /** Override the current time (tests / cursor logic). */
  now?: () => Date;
}

export interface NewsRssOptions {
  /** Skip articles older than this ISO timestamp. */
  since?: string;
}

// Map known crime-related keywords -> (crime_type, severity).
// The first matching pattern wins; ordering matters (most-specific first).
interface CrimeRule {
  pattern: RegExp;
  type: string;
  severity: "low" | "med" | "high";
}

const CRIME_RULES: CrimeRule[] = [
  { pattern: /\b(homicide|murder|killed|fatal shooting)\b/i, type: "homicide", severity: "high" },
  { pattern: /\b(shooting|shot|gunfire|gun violence)\b/i, type: "shooting", severity: "high" },
  { pattern: /\b(stabbing|stabbed|knife attack)\b/i, type: "stabbing", severity: "med" },
  { pattern: /\b(robbery|robbed|armed robbery)\b/i, type: "robbery", severity: "med" },
  { pattern: /\b(carjacking|carjacked)\b/i, type: "carjacking", severity: "med" },
  { pattern: /\b(assault|attacked|battery)\b/i, type: "assault", severity: "med" },
  { pattern: /\b(burglary|burglarized|break-in)\b/i, type: "burglary", severity: "low" },
  { pattern: /\b(arson|fire set|set fire)\b/i, type: "arson", severity: "med" },
  { pattern: /\b(kidnapping|abduction)\b/i, type: "kidnapping", severity: "high" },
  { pattern: /\b(sexual assault|rape)\b/i, type: "sexual_assault", severity: "high" },
  { pattern: /\b(hit[- ]and[- ]run)\b/i, type: "hit_and_run", severity: "med" },
];

export function classifyCrime(
  text: string,
): { type: string; severity: "low" | "med" | "high" } | null {
  for (const rule of CRIME_RULES) {
    if (rule.pattern.test(text)) {
      return { type: rule.type, severity: rule.severity };
    }
  }
  return null;
}

// Cheap RSS parser. We only need <item>'s {title, link, description,
// pubDate}. We avoid pulling in a dependency because feed formats are
// stable enough that a regex-based extractor is reliable and ~free.
//
// CDATA handling: titles often arrive wrapped in <![CDATA[...]]>; we
// strip it. Description is similarly CDATA-wrapped and often contains
// HTML tags -- we strip those for keyword classification and storage.
interface ParsedRssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/m, "$1").trim();
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  return stripCdata(m[1]!).trim();
}

export function parseRss(xml: string): ParsedRssItem[] {
  const items: ParsedRssItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const body = match[1] ?? "";
    const title = pickTag(body, "title") ?? "";
    const link = pickTag(body, "link") ?? "";
    const description =
      pickTag(body, "description") ?? pickTag(body, "content:encoded") ?? "";
    const pubDate = pickTag(body, "pubDate");
    if (!title || !link) continue;
    items.push({ title, link, description, pubDate });
  }
  return items;
}

// Scan a body of text for a known SF neighborhood name. We test each
// canonical name + a small set of common aliases as case-insensitive
// substring matches. Each entry carries the centroid directly (resolved
// at module load) so we never lose the centroid when matching a
// composite name like "Castro" -> "Castro/Upper Market".
interface HaystackEntry {
  /** Display name written to news_incidents.neighborhood. */
  display: string;
  /** Lowercase substring we search for in the article text. */
  key: string;
  /** Resolved centroid. */
  centroid: { lat: number; lng: number };
}

const NEIGHBORHOOD_HAYSTACK: HaystackEntry[] = (() => {
  const out: HaystackEntry[] = [];
  for (const [name, centroid] of Object.entries(SF_NEIGHBORHOOD_CENTROIDS)) {
    // Add the canonical name itself.
    out.push({ display: name, key: name.toLowerCase(), centroid });
    // Also add each "/"-split part so a story that says "the Castro"
    // matches "Castro/Upper Market".
    if (name.includes("/")) {
      for (const part of name.split("/")) {
        const trimmed = part.trim();
        if (trimmed && trimmed !== name) {
          out.push({
            display: trimmed,
            key: trimmed.toLowerCase(),
            centroid,
          });
        }
      }
    }
  }
  // Aliases used in news copy. lookupNeighborhoodCentroid resolves
  // these to the canonical centroid; we keep the display short.
  const aliasPairs: { display: string; key: string; canonical: string }[] = [
    { display: "Bayview", key: "bayview", canonical: "Bayview Hunters Point" },
    {
      display: "Hunters Point",
      key: "hunters point",
      canonical: "Bayview Hunters Point",
    },
    {
      display: "SoMa",
      key: "soma",
      canonical: "South of Market",
    },
  ];
  for (const a of aliasPairs) {
    const centroid = SF_NEIGHBORHOOD_CENTROIDS[a.canonical];
    if (centroid) {
      out.push({ display: a.display, key: a.key, centroid });
    }
  }
  return out;
})();

export function geocodeFromText(
  text: string,
): { name: string; lat: number; lng: number } | null {
  const lower = text.toLowerCase();
  for (const entry of NEIGHBORHOOD_HAYSTACK) {
    if (lower.includes(entry.key)) {
      return {
        name: entry.display,
        lat: entry.centroid.lat,
        lng: entry.centroid.lng,
      };
    }
  }
  // Final attempt: ask the canonical lookup (which handles SoMa/FiDi
  // and other aliases the rest of the codebase already supports).
  for (const word of lower.split(/[^a-z]+/)) {
    const c = lookupNeighborhoodCentroid(word);
    if (c) {
      return { name: word, lat: c.lat, lng: c.lng };
    }
  }
  return null;
}

function parsePubDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchOneFeed(
  feed: RssFeedDef,
  deps: NewsRssDeps,
  cutoff: Date | null,
): Promise<NewNewsIncident[]> {
  const res = await deps.fetch(feed.url, {
    headers: { accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) {
    throw new Error(
      `RSS fetch failed for ${feed.source}: ${res.status} ${res.statusText}`,
    );
  }
  const xml = await res.text();
  const items = parseRss(xml);

  const rows: NewNewsIncident[] = [];
  for (const item of items) {
    const published = parsePubDate(item.pubDate);
    if (!published) continue;
    if (cutoff && published <= cutoff) continue;

    const summary = stripHtml(item.description).slice(0, 1000);
    const text = `${item.title} ${summary}`;
    const crime = classifyCrime(text);
    if (!crime) continue;
    const geo = geocodeFromText(text);
    if (!geo) continue;

    rows.push({
      source: feed.source,
      sourceUrl: item.link,
      title: stripHtml(item.title),
      summary: summary || null,
      crimeType: crime.type,
      severity: crime.severity,
      neighborhood: geo.name,
      address: null,
      lat: geo.lat,
      lng: geo.lng,
      publishedAt: published,
      raw: { feed: feed.source, item } as Record<string, unknown>,
    });
  }
  return rows;
}

export async function fetchNewsRss(
  deps: NewsRssDeps,
  opts: NewsRssOptions = {},
): Promise<{ rows: NewNewsIncident[]; highWaterMark: Date | null }> {
  const feeds = deps.feeds ?? DEFAULT_NEWS_FEEDS;
  const cutoff = opts.since ? new Date(opts.since) : null;
  const validCutoff =
    cutoff && !Number.isNaN(cutoff.getTime()) ? cutoff : null;

  const results = await Promise.allSettled(
    feeds.map((f) => fetchOneFeed(f, deps, validCutoff)),
  );

  const rows: NewNewsIncident[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") rows.push(...r.value);
  }

  // De-dupe within this run by source_url; the DB unique index handles
  // cross-run dedup.
  const seen = new Set<string>();
  const deduped: NewNewsIncident[] = [];
  for (const row of rows) {
    const key = row.sourceUrl ?? `${row.source}::${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  let highWaterMark: Date | null = null;
  for (const row of deduped) {
    if (!highWaterMark || row.publishedAt > highWaterMark) {
      highWaterMark = row.publishedAt;
    }
  }

  return { rows: deduped, highWaterMark };
}
