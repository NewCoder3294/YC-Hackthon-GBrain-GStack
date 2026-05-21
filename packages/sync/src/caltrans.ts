import { z } from "zod";
import type { NewCamera } from "@caltrans/db";
import {
  caltransExternalId,
  isTruthyInService,
  normalizeDirection,
  routePrefix,
} from "./camera-normalize";

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

export function parseCalTransResponse(input: unknown): NewCamera[] {
  const parsed = responseSchema.parse(input);
  const cameras: NewCamera[] = [];

  for (const { cctv } of parsed.data) {
    const hls = cctv.imageData.streamingVideoURL.trim();
    const still = cctv.imageData.static.currentImageURL.trim();
    if (!hls && !still) continue;

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
    const externalId = caltransExternalId(cctv.index);

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
      // Caltrans D4 exposes two different products:
      // - streamingVideoURL: sparse/flaky HLS, useful for ffmpeg workers
      // - static.currentImageURL: broad/reliable CCTV image, best for the wall
      //
      // The wall must not depend on HLS availability. Use the still image as
      // the display stream whenever Caltrans provides one, and preserve the
      // HLS URL in metadata for downstream video consumers.
      streamUrl: still || hls,
      streamType: still ? "mjpeg" : "hls",
      stillImageUrl: still || null,
      providerMetadata: {
        hlsUrl: hls || null,
        hasHls: Boolean(hls),
        stillImageUrl: still || null,
      },
      isActive: isTruthyInService(cctv.inService),
    });
  }

  return cameras;
}
