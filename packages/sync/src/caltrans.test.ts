import { describe, it, expect } from "vitest";
import { parseCalTransResponse } from "./caltrans";

const fixture = {
  data: [
    {
      cctv: {
        index: "TVD04--001",
        recordTimestamp: { recordDate: "2026-05-15", recordTime: "23:00:00" },
        location: {
          district: "04",
          countyName: "ALAMEDA",
          routeName: "880",
          routeSuffix: "N",
          nearbyPlace: "23RD AVE",
          longitude: "-122.234",
          latitude: "37.789",
          milepost: "32.10",
          elevation: "20",
        },
        inService: "True",
        imageData: {
          imageDescription: "I-880 N @ 23RD AVE",
          streamingVideoURL:
            "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04001/tvd04001.stream/playlist.m3u8",
          static: {
            currentImageURL:
              "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04001/tvd04001.jpg",
          },
        },
      },
    },
    {
      cctv: {
        index: "TVD04--002",
        recordTimestamp: { recordDate: "2026-05-15", recordTime: "23:00:00" },
        location: {
          district: "04",
          countyName: "SAN MATEO",
          routeName: "101",
          routeSuffix: "S",
          nearbyPlace: "WHIPPLE",
          longitude: "-122.211",
          latitude: "37.490",
          milepost: "10.5",
          elevation: "30",
        },
        inService: "False",
        imageData: {
          imageDescription: "US-101 S @ WHIPPLE",
          streamingVideoURL: "",
          static: {
            currentImageURL:
              "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04002/tvd04002.jpg",
          },
        },
      },
    },
  ],
};

describe("parseCalTransResponse", () => {
  it("uses Caltrans still images as the display stream and preserves HLS metadata", () => {
    const cameras = parseCalTransResponse(fixture);
    expect(cameras[0]).toMatchObject({
      caltransId: "TVD04--001",
      district: 4,
      route: "I-880",
      direction: "N",
      description: "I-880 N @ 23RD AVE",
      streamType: "mjpeg",
      streamUrl:
        "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04001/tvd04001.jpg",
      stillImageUrl:
        "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04001/tvd04001.jpg",
      providerMetadata: {
        hlsUrl:
          "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04001/tvd04001.stream/playlist.m3u8",
        hasHls: true,
        stillImageUrl:
          "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tvd04001/tvd04001.jpg",
      },
      isActive: true,
    });
    expect(cameras[0]!.lat).toBeCloseTo(37.789);
    expect(cameras[0]!.lng).toBeCloseTo(-122.234);
  });

  it("falls back to MJPEG when no streaming URL", () => {
    const cameras = parseCalTransResponse(fixture);
    expect(cameras[1]!.streamType).toBe("mjpeg");
    expect(cameras[1]!.isActive).toBe(false);
    expect(cameras[1]!.streamUrl).toContain(".jpg");
  });

  it("derives route prefix from numeric route", () => {
    const cameras = parseCalTransResponse(fixture);
    expect(cameras[0]!.route).toBe("I-880");
    expect(cameras[1]!.route).toBe("US-101");
  });

  it("skips entries with no usable stream URL", () => {
    const empty = {
      data: [
        {
          cctv: {
            index: "TVD04--999",
            recordTimestamp: { recordDate: "", recordTime: "" },
            location: {
              district: "04",
              countyName: "",
              routeName: "1",
              routeSuffix: "",
              nearbyPlace: "",
              longitude: "0",
              latitude: "0",
              milepost: "0",
              elevation: "0",
            },
            inService: "True",
            imageData: {
              imageDescription: "",
              streamingVideoURL: "",
              static: { currentImageURL: "" },
            },
          },
        },
      ],
    };
    expect(parseCalTransResponse(empty)).toEqual([]);
  });
});
