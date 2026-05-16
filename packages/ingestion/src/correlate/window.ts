/**
 * Pure normalization of raw signal_events rows into LiveSignals, plus
 * the live-window filter. No IO — the DB read lives in pipeline.ts.
 */

import { z } from "zod";
import {
  CATEGORY_AFFINITY,
  DEFAULT_CONFIDENCE,
  UNKNOWN_SEVERITY,
} from "./config";
import { nearestNeighborhood } from "./geo";
import type { Centroid, CorrelatorSource, LiveSignal } from "./types";

export interface RawRow {
  id: string;
  sourceType: string;
  occurredAt: Date | string;
  lat: number;
  lng: number;
  payload: unknown;
  confidence: number | null;
}

const rawRowSchema = z.object({
  id: z.string().min(1),
  sourceType: z.string().min(1),
  occurredAt: z.union([z.date(), z.string().min(1)]),
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
  payload: z.unknown(),
  confidence: z.number().nullable(),
});

export interface CategoryClass {
  category: string;
  affinityGroup: string;
  severity: number;
}

/** Map free category/keyword text → affinity group + severity. */
export function classifyCategory(raw: string): CategoryClass {
  const text = raw.trim();
  for (const [pattern, group, severity] of CATEGORY_AFFINITY) {
    if (pattern.test(text)) {
      return {
        category: text.length > 0 ? text : group,
        affinityGroup: group,
        severity,
      };
    }
  }
  return {
    category: text.length > 0 ? text : "unknown",
    affinityGroup: "unknown",
    severity: UNKNOWN_SEVERITY,
  };
}

function sourceBucket(
  sourceType: string,
  feed: string | null,
): CorrelatorSource {
  if (feed === "datasf_sfpd_incidents") return "datasf";
  if (sourceType.startsWith("camera")) return "camera";
  if (sourceType === "call_911") return "call_911";
  return "citizen";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickCategoryText(p: Record<string, unknown>): string {
  const parts = [
    str(p["category"]),
    str(p["subcategory"]),
    str(p["description"]),
    Array.isArray(p["keywords"]) ? p["keywords"].join(" ") : "",
    str(p["summary"]),
    str(p["transcript"]),
  ];
  return parts.find((s) => s.trim().length > 0) ?? "";
}

/** Raw row → LiveSignal, or null if it fails the boundary schema. */
export function normalizeSignal(
  raw: RawRow,
  centroids: readonly Centroid[],
): LiveSignal | null {
  const parsed = rawRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;

  const p =
    typeof r.payload === "object" && r.payload !== null
      ? (r.payload as Record<string, unknown>)
      : {};
  const feed = str(p["feed"]).length > 0 ? str(p["feed"]) : null;
  const source = sourceBucket(r.sourceType, feed);

  const occurredAt =
    r.occurredAt instanceof Date
      ? r.occurredAt.toISOString()
      : new Date(r.occurredAt).toISOString();
  if (Number.isNaN(new Date(occurredAt).getTime())) return null;

  const catClass = classifyCategory(pickCategoryText(p));
  const nbhdRaw = str(p["neighborhood"]).trim();
  const neighborhood =
    nbhdRaw.length > 0
      ? nbhdRaw
      : nearestNeighborhood(r.lat, r.lng, centroids);

  const summaryRaw =
    str(p["description"]).trim() ||
    str(p["summary"]).trim() ||
    catClass.category;

  return {
    id: r.id,
    source,
    sourceType: r.sourceType,
    feed,
    occurredAt,
    lat: r.lat,
    lng: r.lng,
    category: catClass.category,
    affinityGroup: catClass.affinityGroup,
    confidence:
      r.confidence === null || !Number.isFinite(r.confidence)
        ? DEFAULT_CONFIDENCE
        : Math.max(0, Math.min(1, r.confidence)),
    neighborhood,
    summary: `${source}: ${summaryRaw}`.slice(0, 140),
  };
}

/** Keep only signals within `hours` of `now`. */
export function selectWindow(
  signals: readonly LiveSignal[],
  now: Date,
  hours: number,
): LiveSignal[] {
  const cutoff = now.getTime() - hours * 3_600_000;
  return signals.filter((s) => {
    const t = new Date(s.occurredAt).getTime();
    return t >= cutoff && t <= now.getTime();
  });
}
