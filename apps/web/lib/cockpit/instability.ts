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

// Map the orchestrator's internal source IDs to display labels for the
// Source Mix panel. Unknown values fall through unchanged.
const SOURCE_DISPLAY: Record<string, string> = {
  sfpd_cad: "SFPD CAD",
  sfpd_reports: "SFPD Reports",
  sf_311: "SF 311",
  fire_ems: "Fire / EMS",
  "511_traffic": "511 Traffic",
  "511_transit": "511 Transit",
};

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
  // Reads `live_incidents` — the real DataSF orchestrator output (SFPD CAD,
  // SF 311, SFPD reports, 511 traffic). `news_incidents` was historically
  // seeded synthetic data and is no longer the canonical incident table.
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("live_incidents")
    .select("severity, neighborhood, title, source, lat, lng, occurred_at")
    .gte("occurred_at", since)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .gte("lat", SF_BBOX.minLat)
    .lte("lat", SF_BBOX.maxLat)
    .gte("lng", SF_BBOX.minLng)
    .lte("lng", SF_BBOX.maxLng)
    .order("occurred_at", { ascending: false })
    .limit(2500);

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
    const occurredAt = row.occurred_at as string;
    const ageMs = now - new Date(occurredAt).getTime();
    if (ageMs < 0) continue;

    if (ageMs <= cutoffMs) {
      currentTotal += 1;
      severity[sev] += 1;
      // live_incidents.title is the CAD/911 call descriptor — uppercase,
      // operator-readable ("SHOT SPOTTER", "PROWLER", "ASSAULT / BATTERY").
      // Lowercased for the Crime Types panel.
      const crimeType = ((row as { title?: string | null }).title ?? "other")
        .toString()
        .trim()
        .toLowerCase() || "other";
      crimeCounts.set(crimeType, (crimeCounts.get(crimeType) ?? 0) + 1);
      const rawSource = ((row as { source?: string | null }).source ?? "unknown")
        .toString()
        .trim() || "unknown";
      const source = SOURCE_DISPLAY[rawSource] ?? rawSource;
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
