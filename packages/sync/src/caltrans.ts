import { z } from "zod";
import type { NewCamera } from "@caltrans/db";

// CalTrans D4 schema has shifted over time:
//   pre-2026-05:   route was `routeName` (e.g., "880"), `routeSuffix` for direction ("N"),
//                  inService was the string "True"/"False".
//   2026-05+:      route is `route` (e.g., "I-580", prefix included), `direction` long
//                  form ("West"/"East"), inService is a real boolean.
//
// The parser accepts either shape so the sync survives upstream changes
// without a redeploy. Both old and new fields are optional in the schema;
// the resolution functions below pick whichever is present.
const cctvSchema = z.object({
  index: z.string(),
  location: z.object({
    district: z.union([z.string(), z.number()]),
    route: z.string().optional(),
    routeName: z.string().optional(),
    routeSuffix: z.string().optional().default(""),
    direction: z.string().optional().default(""),
    nearbyPlace: z.string().optional().default(""),
    locationName: z.string().optional().default(""),
    longitude: z.string(),
    latitude: z.string(),
    milepost: z.string().optional().default(""),
  }),
  inService: z.union([z.string(), z.boolean()]),
  imageData: z.object({
    imageDescription: z.string().optional().default(""),
    streamingVideoURL: z.string().optional().default(""),
    static: z
      .object({ currentImageURL: z.string().optional().default("") })
      .optional()
      .default({ currentImageURL: "" }),
  }),
});

const responseSchema = z.object({
  data: z.array(z.object({ cctv: cctvSchema })),
});

function routePrefix(raw: string): string {
  if (/^[A-Z]+-?\d+/i.test(raw)) return raw.toUpperCase(); // already prefixed (e.g. "I-580")
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const interstates = new Set([
    5, 80, 205, 238, 280, 380, 405, 505, 580, 680, 780, 880, 980,
  ]);
  if (interstates.has(n)) return `I-${n}`;
  if (n === 101 || n === 50 || n === 395) return `US-${n}`;
  return `SR-${n}`;
}

// Normalize direction to a single uppercase letter when possible.
function normalizeDirection(raw: string): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (v.startsWith("N")) return "N";
  if (v.startsWith("S")) return "S";
  if (v.startsWith("E")) return "E";
  if (v.startsWith("W")) return "W";
  return v.slice(0, 1) || null;
}

function isTruthyInService(v: string | boolean): boolean {
  if (typeof v === "boolean") return v;
  return v.toLowerCase() === "true";
}

export function parseCalTransResponse(input: unknown): NewCamera[] {
  const parsed = responseSchema.parse(input);
  const cameras: NewCamera[] = [];

  for (const { cctv } of parsed.data) {
    const hls = cctv.imageData.streamingVideoURL.trim();
    const mjpeg = cctv.imageData.static.currentImageURL.trim();
    if (!hls && !mjpeg) continue;

    const lat = Number(cctv.location.latitude);
    const lng = Number(cctv.location.longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      (lat === 0 && lng === 0)
    )
      continue;

    const rawRoute = cctv.location.route ?? cctv.location.routeName ?? "";
    if (!rawRoute) continue;
    const route = routePrefix(rawRoute);

    const rawDir = cctv.location.direction || cctv.location.routeSuffix || "";
    const direction = normalizeDirection(rawDir);

    const district = Number(cctv.location.district);

    const fallbackDescription = `${route}${direction ? ` ${direction}` : ""}${cctv.location.nearbyPlace ? ` @ ${cctv.location.nearbyPlace}` : ""}`.trim();

    // ID format: the historical P1 sync used "D4-<index>". Preserve it so
    // we upsert onto existing rows rather than creating duplicates. Only
    // prefix when CalTrans returned a bare numeric index (the new shape) —
    // leave already-prefixed identifiers (legacy + test fixtures) alone.
    const externalId = /^\d+$/.test(cctv.index)
      ? `D4-${cctv.index}`
      : cctv.index;

    cameras.push({
      caltransId: externalId,
      district: Number.isFinite(district) ? district : 4,
      route,
      direction,
      mileMarker: cctv.location.milepost || null,
      description:
        cctv.imageData.imageDescription ||
        cctv.location.locationName ||
        fallbackDescription ||
        route,
      lat,
      lng,
      streamUrl: hls || mjpeg,
      streamType: hls ? "hls" : "mjpeg",
      isActive: isTruthyInService(cctv.inService),
    });
  }

  return cameras;
}
