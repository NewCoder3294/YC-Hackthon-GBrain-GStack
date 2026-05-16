/**
 * Pure geo helpers. No PostGIS in this stack (see schema.ts header), so
 * proximity is a plain haversine; neighborhood assignment is
 * nearest-centroid, where centroids are computed from the DataSF rows
 * already in signal_events (no external polygon dependency).
 */

import type { Centroid } from "./types";

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function centroidsFromSignals(
  rows: ReadonlyArray<{ neighborhood: string; lat: number; lng: number }>,
): Centroid[] {
  const acc = new Map<string, { lat: number; lng: number; n: number }>();
  for (const r of rows) {
    const k = r.neighborhood.trim();
    if (k.length === 0 || k.toLowerCase() === "unknown") continue;
    const c = acc.get(k) ?? { lat: 0, lng: 0, n: 0 };
    acc.set(k, { lat: c.lat + r.lat, lng: c.lng + r.lng, n: c.n + 1 });
  }
  return [...acc.entries()].map(([neighborhood, c]) => ({
    neighborhood,
    lat: c.lat / c.n,
    lng: c.lng / c.n,
  }));
}

export function nearestNeighborhood(
  lat: number,
  lng: number,
  centroids: readonly Centroid[],
): string {
  let best = "Unknown";
  let bestD = Infinity;
  for (const c of centroids) {
    const d = haversineMeters(lat, lng, c.lat, c.lng);
    if (d < bestD) {
      bestD = d;
      best = c.neighborhood;
    }
  }
  return best;
}
