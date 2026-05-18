// scripts/seed-news.ts — populate news_incidents with synthetic SF rows.
//
// DEPRECATED: the cockpit now reads from live_incidents (real DataSF
// data). This seeder writes fake rows with source labels that look real
// (nextdoor, sf-chronicle, sfpd-cad, etc.) — every row's source_url is
// seed://news/N. Gated behind SEED_NEWS=1 to prevent accidental
// pollution of real environments.
//
// Idempotent: each row has a stable `source_url` of the form
// `seed://news/<idx>` so re-running upserts in place instead of duplicating.

if (process.env.SEED_NEWS !== "1") {
  console.error(
    "seed-news refuses to run without SEED_NEWS=1. This writes synthetic " +
      "data with source labels that look real and will pollute the cockpit. " +
      "Set SEED_NEWS=1 only against a throwaway local stack.",
  );
  process.exit(1);
}

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const envPath = resolve(__dirname, "..", "apps", "web", ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      const key = m[1]!;
      const value = (m[2] ?? "").replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {
  /* fall back to shell env */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// SF neighborhoods with approximate centroids. Weights bias the
// distribution toward known hotspots (Tenderloin, SoMa, Mission) so the
// neighborhood-instability ranking shows the patterns operators expect.
const NEIGHBORHOODS: Array<{
  name: string;
  lat: number;
  lng: number;
  weight: number;
}> = [
  { name: "Tenderloin", lat: 37.7837, lng: -122.4135, weight: 18 },
  { name: "South of Market", lat: 37.7785, lng: -122.4056, weight: 14 },
  { name: "Mission", lat: 37.7599, lng: -122.4148, weight: 12 },
  { name: "Bayview", lat: 37.7311, lng: -122.3893, weight: 8 },
  { name: "Nob Hill", lat: 37.7929, lng: -122.4147, weight: 6 },
  { name: "Castro", lat: 37.762, lng: -122.435, weight: 5 },
  { name: "Marina", lat: 37.8027, lng: -122.4364, weight: 4 },
  { name: "Bernal Heights", lat: 37.7398, lng: -122.4159, weight: 4 },
  { name: "Inner Sunset", lat: 37.7635, lng: -122.4677, weight: 4 },
  { name: "North Beach", lat: 37.8003, lng: -122.4101, weight: 4 },
  { name: "Lakeshore", lat: 37.7268, lng: -122.4949, weight: 3 },
  { name: "Japantown", lat: 37.7849, lng: -122.4294, weight: 3 },
  { name: "Visitacion Valley", lat: 37.7136, lng: -122.4087, weight: 3 },
  { name: "Oceanview/Merced/Ingleside", lat: 37.7194, lng: -122.4587, weight: 3 },
  { name: "West of Twin Peaks", lat: 37.7449, lng: -122.4598, weight: 2 },
  { name: "Financial District/South Beach", lat: 37.7935, lng: -122.4007, weight: 3 },
  { name: "Lincoln Park", lat: 37.7849, lng: -122.5026, weight: 1 },
  { name: "Russian Hill", lat: 37.801, lng: -122.4187, weight: 2 },
];

// (label, severity) — high-severity types weight toward "high"/"med",
// nuisance types weight toward "low". Composition gives the Severity Mix
// panel a believable shape (mostly low, sprinkling of med, a few high).
const CRIME_TYPES: Array<{
  type: string;
  severityMix: Array<"low" | "med" | "high">;
}> = [
  { type: "burglary", severityMix: ["med", "med", "high"] },
  { type: "assault/battery", severityMix: ["med", "high", "high"] },
  { type: "strongarm robbery", severityMix: ["high", "high", "med"] },
  { type: "prowler", severityMix: ["low", "low", "med"] },
  { type: "suspicious person", severityMix: ["low", "low", "low"] },
  { type: "well being check", severityMix: ["low", "low", "low"] },
  { type: "complaint unknown", severityMix: ["low", "low", "low"] },
  { type: "meet w/officer", severityMix: ["low", "low", "low"] },
  { type: "meet w/citizen", severityMix: ["low", "low", "low"] },
  { type: "traffic hazard", severityMix: ["low", "low", "med"] },
  { type: "vehicle theft", severityMix: ["med", "med", "low"] },
  { type: "vandalism", severityMix: ["low", "low", "med"] },
  { type: "shoplifting", severityMix: ["low", "med", "low"] },
  { type: "narcotics", severityMix: ["med", "low", "med"] },
  { type: "explosion", severityMix: ["high", "high", "med"] },
];

const SOURCES = [
  "sfpd-cad",
  "sfgov-911",
  "citizen-app",
  "sf-chronicle",
  "mission-local",
  "nextdoor",
];

const TITLE_TEMPLATES = [
  "Reported {type} near {place}",
  "{type} call — {place}",
  "Suspected {type} at {place}",
  "Witness reports {type} in {place} area",
  "Active {type} investigation, {place}",
];

const PLACES = [
  "Market & 6th",
  "Mission & 16th",
  "Geary & Polk",
  "Van Ness & Eddy",
  "3rd & Brannan",
  "Bush & Kearny",
  "Castro & 18th",
  "Divisadero & Hayes",
  "24th & Mission",
  "Cesar Chavez & Bryant",
  "Fillmore & Geary",
  "Larkin & Turk",
  "Ellis & Leavenworth",
  "Broadway & Columbus",
  "Stockton & Washington",
  "Howard & 7th",
  "Folsom & 10th",
  "Pine & Powell",
];

// Mulberry32 — small deterministic RNG so the seed produces the same
// distribution across runs. A handful of HIGHs at known hotspots is more
// useful for QA than fresh randomness on every run.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20260518);

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let n = rand() * total;
  for (const item of items) {
    n -= item.weight;
    if (n <= 0) return item;
  }
  return items[items.length - 1]!;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function jitter(coord: number, range: number): number {
  return coord + (rand() - 0.5) * range;
}

const COUNT = 110;
const WINDOW_MS = 48 * 60 * 60 * 1000;

interface Row {
  source: string;
  source_url: string;
  title: string;
  summary: string;
  crime_type: string;
  severity: "low" | "med" | "high";
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  published_at: string;
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  const now = Date.now();
  for (let i = 0; i < COUNT; i++) {
    const n = pickWeighted(NEIGHBORHOODS);
    const ct = pick(CRIME_TYPES);
    const severity = pick(ct.severityMix);
    const place = pick(PLACES);
    const titleTpl = pick(TITLE_TEMPLATES);
    // Recency bias — most rows in the last 24 h, with a smaller prior-
    // window tail to feed the "trend" calculation. Square the random so
    // ages cluster near now.
    const r = rand();
    const ageMs = r * r * WINDOW_MS;
    rows.push({
      source: pick(SOURCES),
      source_url: `seed://news/${i}`,
      title: titleTpl.replace("{type}", ct.type).replace("{place}", place),
      summary: `${ct.type} dispatch in ${n.name}. Auto-generated for cockpit fixtures.`,
      crime_type: ct.type,
      severity,
      neighborhood: n.name,
      address: place,
      lat: jitter(n.lat, 0.01),
      lng: jitter(n.lng, 0.01),
      published_at: new Date(now - ageMs).toISOString(),
    });
  }
  return rows;
}

async function main() {
  // news_incidents has only a partial unique index on source_url, so
  // ON CONFLICT can't be used directly. Idempotency comes from deleting
  // prior seed rows (identified by `source LIKE 'seed-%' OR source_url LIKE 'seed://%'`)
  // before inserting fresh.
  const { error: delErr } = await supabase
    .from("news_incidents")
    .delete()
    .like("source_url", "seed://%");
  if (delErr) {
    console.error("clear prior seed rows failed:", delErr.message);
    process.exit(1);
  }

  const rows = buildRows();
  const chunkSize = 50;
  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("news_incidents").insert(chunk);
    if (error) {
      console.error("insert failed:", error.message);
      process.exit(1);
    }
    written += chunk.length;
  }
  console.log(`seeded ${written} news_incidents rows (window: last 48 h)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
