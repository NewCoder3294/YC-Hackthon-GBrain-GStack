import { SF_HOTSPOTS } from "@/lib/dispatch-hotspots";
import type { KgNode } from "@/components/kg/types";

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

export function matchHotspotByName(label: string): string | null {
  const q = label.toLowerCase();
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
  const x = padding + tx * usableW;
  const y = padding + (1 - ty) * usableH;
  return {
    x: Math.round(Math.max(padding, Math.min(width - padding, x))),
    y: Math.round(Math.max(padding, Math.min(height - padding, y))),
  };
}

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
  ctx: NeighborhoodContext,
): string {
  const meta = node.meta ?? {};
  const lat = typeof meta.lat === "number" ? meta.lat : null;
  const lng = typeof meta.lng === "number" ? meta.lng : null;
  if (lat != null && lng != null) return nearestHotspot(lat, lng);

  if (node.kind === "gang") {
    return ctx.gangNeighborhood.get(node.id) ?? UNMAPPED;
  }
  if (node.kind === "member") {
    const gang = ctx.memberToGang.get(node.id);
    return (gang && ctx.gangNeighborhood.get(gang)) ?? UNMAPPED;
  }
  if (node.kind === "incident") {
    return ctx.incidentNeighborhood.get(node.id) ?? UNMAPPED;
  }
  // direct override: some node kinds embed their neighborhood in meta
  if (typeof meta.neighborhood === "string" && meta.neighborhood) {
    return meta.neighborhood;
  }
  return UNMAPPED;
}
