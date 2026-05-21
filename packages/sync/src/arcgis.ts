import { z } from "zod";
import type { NewCamera, NewCameraSurface } from "@caltrans/db";
import {
  caltransExternalId,
  isTruthyInService,
  normalizeDirection,
  routePrefix,
} from "./camera-normalize";

export const CALTRANS_ARCGIS_CCTV_URL =
  "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0/query";

export const CALTRANS_ARCGIS_PROVIDER = "caltrans_arcgis";

const D4_QUERY_FIELDS = [
  "OBJECTID",
  "index_",
  "district",
  "county",
  "route",
  "routeSuffix",
  "direction",
  "postmile",
  "locationName",
  "nearbyPlace",
  "inService",
  "imageDescription",
  "streamingVideoURL",
  "currentImageURL",
  "currentImageUpdateFrequency",
  "latitude",
  "longitude",
].join(",");

export function buildCaltransArcgisCctvUrl(district = 4): string {
  const url = new URL(CALTRANS_ARCGIS_CCTV_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("where", `district=${district}`);
  url.searchParams.set("outFields", D4_QUERY_FIELDS);
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("orderByFields", "index_ ASC");
  url.searchParams.set("resultRecordCount", "2000");
  return url.toString();
}

const nullableString = z.string().nullable().optional().default(null);
const nullableNumber = z.number().nullable().optional().default(null);

const featureSchema = z.object({
  attributes: z.object({
    OBJECTID: z.number().optional(),
    index_: z.union([z.number(), z.string()]),
    district: z.union([z.number(), z.string()]).nullable().optional(),
    county: nullableString,
    route: nullableString,
    routeSuffix: nullableString,
    direction: nullableString,
    postmile: nullableNumber,
    locationName: nullableString,
    nearbyPlace: nullableString,
    inService: z.union([z.string(), z.boolean()]).nullable().optional(),
    imageDescription: nullableString,
    streamingVideoURL: nullableString,
    currentImageURL: nullableString,
    currentImageUpdateFrequency: nullableString,
    latitude: nullableNumber,
    longitude: nullableNumber,
  }),
  geometry: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .optional(),
});

const responseSchema = z.object({
  features: z.array(featureSchema).default([]),
});

export type SurfaceKind = "still" | "hls" | "iframe" | "rtsp";

export interface ParsedCameraSurface
  extends Omit<NewCameraSurface, "cameraId" | "id" | "lastSyncedAt"> {
  kind: SurfaceKind;
}

export interface ParsedCameraInventory {
  camera: NewCamera;
  surfaces: ParsedCameraSurface[];
}

function cleanUrl(v: string | null | undefined): string | null {
  const trimmed = v?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function validCoordinate(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function surfaceKey(caltransId: string, kind: SurfaceKind): string {
  return `${caltransId}:${kind}`;
}

export function parseCaltransArcgisResponse(
  input: unknown,
): ParsedCameraInventory[] {
  const parsed = responseSchema.parse(input);
  const out: ParsedCameraInventory[] = [];

  for (const feature of parsed.features) {
    const a = feature.attributes;
    const caltransId = caltransExternalId(a.index_);
    if (!caltransId) continue;

    const still = cleanUrl(a.currentImageURL);
    const hls = cleanUrl(a.streamingVideoURL);

    const lat = validCoordinate(a.latitude) ? a.latitude : feature.geometry?.y;
    const lng = validCoordinate(a.longitude) ? a.longitude : feature.geometry?.x;
    if (
      !validCoordinate(lat) ||
      !validCoordinate(lng) ||
      (lat === 0 && lng === 0)
    ) {
      continue;
    }

    const route = routePrefix(a.route ?? "");
    if (!route) continue;
    const direction = normalizeDirection(a.direction ?? a.routeSuffix);
    const district = Number(a.district ?? 4);
    const fallbackDescription = `${route}${direction ? ` ${direction}` : ""}${
      a.nearbyPlace ? ` @ ${a.nearbyPlace}` : ""
    }`.trim();
    const description =
      a.imageDescription ||
      a.locationName ||
      fallbackDescription ||
      route;

    const surfaces: ParsedCameraSurface[] = [];
    if (still) {
      surfaces.push({
        kind: "still",
        url: still,
        provider: CALTRANS_ARCGIS_PROVIDER,
        providerKey: surfaceKey(caltransId, "still"),
        priority: 10,
        isActive: true,
        metadata: {
          objectId: a.OBJECTID ?? null,
          county: a.county ?? null,
          updateFrequencySeconds: Number(a.currentImageUpdateFrequency) || null,
        },
      });
    }
    if (hls && /\.m3u8(?:[?#].*)?$/i.test(hls)) {
      surfaces.push({
        kind: "hls",
        url: hls,
        provider: CALTRANS_ARCGIS_PROVIDER,
        providerKey: surfaceKey(caltransId, "hls"),
        priority: 20,
        isActive: true,
        metadata: {
          objectId: a.OBJECTID ?? null,
          county: a.county ?? null,
        },
      });
    }

    out.push({
      camera: {
        caltransId,
        district: Number.isFinite(district) ? district : 4,
        route,
        direction,
        mileMarker: a.postmile == null ? null : String(a.postmile),
        description,
        lat,
        lng,
        streamUrl: still || hls || "",
        streamType: still ? "mjpeg" : "hls",
        stillImageUrl: still,
        source: "caltrans",
        providerMetadata: {
          provider: "arcgis",
          objectId: a.OBJECTID ?? null,
          county: a.county ?? null,
          providerStatus: {
            inService: isTruthyInService(a.inService),
            rawInService: a.inService ?? null,
          },
          hlsUrl: hls,
          hasHls: Boolean(hls),
          stillImageUrl: still,
          currentImageUpdateFrequency: a.currentImageUpdateFrequency ?? null,
        },
        isActive: isTruthyInService(a.inService),
      },
      surfaces,
    });
  }

  return out;
}
