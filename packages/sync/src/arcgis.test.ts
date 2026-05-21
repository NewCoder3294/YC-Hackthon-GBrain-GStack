import { describe, expect, it } from "vitest";
import {
  buildCaltransArcgisCctvUrl,
  parseCaltransArcgisResponse,
} from "./arcgis";

const feature = {
  attributes: {
    OBJECTID: 447,
    index_: 1,
    district: 4,
    county: "Alameda",
    route: "I-580",
    routeSuffix: null,
    direction: "West",
    postmile: 45.44,
    locationName: "TV102 -- I-580 : West of SR-24",
    nearbyPlace: "Oakland",
    inService: "True",
    imageDescription: null,
    streamingVideoURL:
      "https://wzmedia.dot.ca.gov/D4/W580_JWO_24_IC.stream/playlist.m3u8",
    currentImageURL:
      "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv102i580westofsr24/tv102i580westofsr24.jpg",
    currentImageUpdateFrequency: "5",
    latitude: 37.82539,
    longitude: -122.27291,
  },
  geometry: { x: -122.27291, y: 37.82539 },
};

describe("parseCaltransArcgisResponse", () => {
  it("normalizes ArcGIS CCTV features into camera inventory and surfaces", () => {
    const rows = parseCaltransArcgisResponse({ features: [feature] });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.camera).toMatchObject({
      caltransId: "D4-1",
      district: 4,
      route: "I-580",
      direction: "W",
      mileMarker: "45.44",
      streamType: "mjpeg",
      streamUrl:
        "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv102i580westofsr24/tv102i580westofsr24.jpg",
      stillImageUrl:
        "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv102i580westofsr24/tv102i580westofsr24.jpg",
      source: "caltrans",
      isActive: true,
    });
    expect(rows[0]!.surfaces).toEqual([
      expect.objectContaining({
        kind: "still",
        provider: "caltrans_arcgis",
        providerKey: "D4-1:still",
        priority: 10,
      }),
      expect.objectContaining({
        kind: "hls",
        provider: "caltrans_arcgis",
        providerKey: "D4-1:hls",
        priority: 20,
      }),
    ]);
  });

  it("keeps inventory rows without surfaces so CWWP2 can enrich them", () => {
    const rows = parseCaltransArcgisResponse({
      features: [
        {
          ...feature,
          attributes: {
            ...feature.attributes,
            currentImageURL: "",
            streamingVideoURL: "",
          },
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.camera.streamUrl).toBe("");
    expect(rows[0]!.surfaces).toEqual([]);
  });

  it("skips rows without usable coordinates", () => {
    expect(
      parseCaltransArcgisResponse({
        features: [
          {
            ...feature,
            attributes: {
              ...feature.attributes,
              currentImageURL: "https://example.com/camera.jpg",
              latitude: 0,
              longitude: 0,
            },
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("buildCaltransArcgisCctvUrl", () => {
  it("builds a District 4 query URL", () => {
    const url = new URL(buildCaltransArcgisCctvUrl(4));
    expect(url.searchParams.get("where")).toBe("district=4");
    expect(url.searchParams.get("returnGeometry")).toBe("true");
    expect(url.searchParams.get("outFields")).toContain("currentImageURL");
  });
});
