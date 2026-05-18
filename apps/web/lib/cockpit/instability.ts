import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-neighborhood instability snapshot. Score is a recency-weighted sum
 * of incident severity over the last 24 h:
 *
 *   score(n) = Σ severityWeight(s) × exp(-ageHours / 6)
 *
 * — so a HIGH 30 minutes ago dominates a LOW from 12 hours ago. Cheap to
 * compute server-side from `news_incidents`; nothing else in the data
 * model gives us a reliable per-neighborhood signal yet.
 */
export interface NeighborhoodInstability {
  neighborhood: string;
  score: number;
  /** Raw incident count contributing to the score. */
  count: number;
  /** Highest severity observed in the window. */
  topSeverity: "low" | "med" | "high";
}

export interface CityRiskSnapshot {
  /** 0–100 normalized city-wide risk score (clamped). */
  cityScore: number;
  /** Total incident count in the last 24 h. */
  totalIncidents: number;
  /** Direction vs the prior 24 h window — "up" / "flat" / "down". */
  trend: "up" | "flat" | "down";
  /** Percent change vs the prior window (can be negative). */
  trendPct: number;
  /** Most volatile neighborhood (top score). */
  topNeighborhood: string | null;
}

export interface SeverityBreakdown {
  high: number;
  med: number;
  low: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface CockpitAggregates {
  severity: SeverityBreakdown;
  topCrimeTypes: NamedCount[];
  sourceMix: NamedCount[];
  /** 24 ints, oldest hour (23h ago) → newest hour (now). */
  hourlyPulse: number[];
}

const SF_BBOX = { minLat: 37.7, maxLat: 37.84, minLng: -122.52, maxLng: -122.35 };

function severityWeight(s: "low" | "med" | "high"): number {
  return s === "high" ? 10 : s === "med" ? 3 : 1;
}

function recencyDecay(ageHours: number): number {
  return Math.exp(-ageHours / 6);
}

/**
 * Load both the per-neighborhood ranking and the city-wide risk snapshot
 * from a single query. The same row set powers both views so they stay
 * coherent (e.g. a top-listed neighborhood that doesn't show up in the
 * city total would be a bug).
 */
export async function loadInstability(): Promise<{
  ranking: NeighborhoodInstability[];
  city: CityRiskSnapshot;
  aggregates: CockpitAggregates;
}> {
  const supabase = await createClient();
  // Pull the last 48 h so we can compare current vs prior 24 h windows.
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("news_incidents")
    .select("severity, neighborhood, crime_type, source, lat, lng, published_at")
    .gte("published_at", since)
    .gte("lat", SF_BBOX.minLat)
    .lte("lat", SF_BBOX.maxLat)
    .gte("lng", SF_BBOX.minLng)
    .lte("lng", SF_BBOX.maxLng)
    .order("published_at", { ascending: false })
    .limit(1500);

  if (error || !data) {
    return {
      ranking: [],
      city: {
        cityScore: 0,
        totalIncidents: 0,
        trend: "flat",
        trendPct: 0,
        topNeighborhood: null,
      },
      aggregates: {
        severity: { high: 0, med: 0, low: 0 },
        topCrimeTypes: [],
        sourceMix: [],
        hourlyPulse: new Array(24).fill(0),
      },
    };
  }

  const now = Date.now();
  const cutoffMs = 24 * 60 * 60 * 1000;

  type Acc = { score: number; count: number; topSeverity: "low" | "med" | "high" };
  const buckets = new Map<string, Acc>();
  let currentTotal = 0;
  let priorTotal = 0;
  const severity: SeverityBreakdown = { high: 0, med: 0, low: 0 };
  const crimeCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const hourlyPulse = new Array(24).fill(0) as number[];

  for (const row of data) {
    const sev = (row.severity as string) === "high" ? "high"
      : (row.severity as string) === "med" ? "med" : "low";
    const nbhd = (row.neighborhood as string | null)?.trim() || "Unknown";
    const publishedAt = row.published_at as string;
    const ageMs = now - new Date(publishedAt).getTime();
    if (ageMs < 0) continue;

    if (ageMs <= cutoffMs) {
      currentTotal += 1;
      severity[sev] += 1;
      const crimeType = ((row as { crime_type?: string | null }).crime_type ?? "other")
        .toString()
        .trim() || "other";
      crimeCounts.set(crimeType, (crimeCounts.get(crimeType) ?? 0) + 1);
      const source = ((row as { source?: string | null }).source ?? "unknown")
        .toString()
        .trim() || "unknown";
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      const ageH = ageMs / (60 * 60 * 1000);
      // Bucket 0 = oldest (~23 h ago), 23 = newest (now-ish).
      const bucket = Math.min(23, Math.max(0, 23 - Math.floor(ageH)));
      hourlyPulse[bucket] = (hourlyPulse[bucket] ?? 0) + 1;
      const contribution = severityWeight(sev) * recencyDecay(ageH);
      const existing = buckets.get(nbhd);
      if (!existing) {
        buckets.set(nbhd, { score: contribution, count: 1, topSeverity: sev });
      } else {
        existing.score += contribution;
        existing.count += 1;
        // upgrade only — never downgrade
        if (sev === "high" || (sev === "med" && existing.topSeverity === "low")) {
          existing.topSeverity = sev;
        }
      }
    } else if (ageMs <= cutoffMs * 2) {
      priorTotal += 1;
    }
  }

  const topCrimeTypes: NamedCount[] = Array.from(crimeCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const sourceMix: NamedCount[] = Array.from(sourceCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const ranking = Array.from(buckets.entries())
    .map(([neighborhood, v]) => ({
      neighborhood,
      score: v.score,
      count: v.count,
      topSeverity: v.topSeverity,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Normalize city score: total of top-5 scores → 0..100 (cap at 100).
  const top5Sum = ranking.reduce((acc, r) => acc + r.score, 0);
  const cityScore = Math.max(0, Math.min(100, Math.round(top5Sum * 2)));

  const trendPct = priorTotal === 0
    ? (currentTotal > 0 ? 100 : 0)
    : Math.round(((currentTotal - priorTotal) / priorTotal) * 100);
  const trend: "up" | "flat" | "down" =
    Math.abs(trendPct) < 5 ? "flat" : trendPct > 0 ? "up" : "down";

  return {
    ranking,
    city: {
      cityScore,
      totalIncidents: currentTotal,
      trend,
      trendPct,
      topNeighborhood: ranking[0]?.neighborhood ?? null,
    },
    aggregates: {
      severity,
      topCrimeTypes,
      sourceMix,
      hourlyPulse,
    },
  };
}
