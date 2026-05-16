import { z } from "zod";
import type { NewCamera } from "@caltrans/db";

const cctvSchema = z.object({
  index: z.string(),
  location: z.object({
    district: z.string(),
    routeName: z.string(),
    routeSuffix: z.string().optional().default(""),
    nearbyPlace: z.string().optional().default(""),
    longitude: z.string(),
    latitude: z.string(),
    milepost: z.string().optional().default(""),
  }),
  inService: z.string(),
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

function routePrefix(routeName: string): string {
  const n = Number(routeName);
  if (!Number.isFinite(n)) return routeName;
  const interstates = new Set([5, 80, 205, 238, 280, 380, 405, 505, 580, 680, 780, 880, 980]);
  if (interstates.has(n)) return `I-${n}`;
  if (n === 101 || n === 50 || n === 395) return `US-${n}`;
  return `SR-${n}`;
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
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;

    cameras.push({
      caltransId: cctv.index,
      district: Number(cctv.location.district),
      route: routePrefix(cctv.location.routeName),
      direction: cctv.location.routeSuffix || null,
      mileMarker: cctv.location.milepost || null,
      description:
        cctv.imageData.imageDescription ||
        `${routePrefix(cctv.location.routeName)} ${cctv.location.routeSuffix} @ ${cctv.location.nearbyPlace}`.trim(),
      lat,
      lng,
      streamUrl: hls || mjpeg,
      streamType: hls ? "hls" : "mjpeg",
      isActive: cctv.inService.toLowerCase() === "true",
    });
  }

  return cameras;
}
