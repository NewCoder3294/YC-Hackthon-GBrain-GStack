import { describe, it, expect, vi } from "vitest";
import {
  selectPinnedCameras,
  parseFallbackSfCameras,
  type PinnedCamera,
} from "./pins";

/** A drizzle-ish select chain that resolves to fixed rows. */
function fakeDbReturning(rows: readonly Record<string, unknown>[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
  };
}

const SF_ROW = {
  caltransId: "TVD04--SF1",
  description: "US-101 N @ VERMONT",
  lat: 37.765,
  lng: -122.405,
  streamUrl: "https://wzmedia.dot.ca.gov/D4/sf1.stream/playlist.m3u8",
};
const SF_ROW_2 = {
  caltransId: "TVD04--SF2",
  description: "I-80 W @ FREMONT",
  lat: 37.79,
  lng: -122.39,
  streamUrl: "https://wzmedia.dot.ca.gov/D4/sf2.stream/playlist.m3u8",
};

const fallbackFixture = {
  data: [
    {
      cctv: {
        index: "TVD04--SFA",
        location: {
          county: "San Francisco",
          district: "04",
          latitude: "37.7749",
          longitude: "-122.4194",
          locationName: "US-101 N @ 6TH ST",
          nearbyPlace: "6TH ST",
          route: "101",
        },
        imageData: {
          streamingVideoURL:
            "https://wzmedia.dot.ca.gov/D4/N101_at_6th.stream/playlist.m3u8",
        },
      },
    },
    {
      // Wrong county — must be filtered out.
      cctv: {
        index: "TVD04--ALA",
        location: {
          county: "Alameda",
          district: "04",
          latitude: "37.789",
          longitude: "-122.234",
          locationName: "I-880 N @ 23RD AVE",
          nearbyPlace: "23RD AVE",
          route: "880",
        },
        imageData: {
          streamingVideoURL:
            "https://wzmedia.dot.ca.gov/D4/ala.stream/playlist.m3u8",
        },
      },
    },
    {
      // SF county but no HLS URL — must be filtered out.
      cctv: {
        index: "TVD04--SFB",
        location: {
          county: "San Francisco",
          district: "04",
          latitude: "37.78",
          longitude: "-122.41",
          locationName: "CA-1 S @ GEARY",
          nearbyPlace: "GEARY",
          route: "1",
        },
        imageData: { streamingVideoURL: "" },
      },
    },
    {
      // SF county, HLS, but outside SF bbox — filtered out.
      cctv: {
        index: "TVD04--SFC",
        location: {
          county: "San Francisco",
          district: "04",
          latitude: "38.50",
          longitude: "-122.40",
          locationName: "bogus coords",
          nearbyPlace: "",
          route: "101",
        },
        imageData: {
          streamingVideoURL:
            "https://wzmedia.dot.ca.gov/D4/sfc.stream/playlist.m3u8",
        },
      },
    },
  ],
};

describe("parseFallbackSfCameras", () => {
  it("keeps only SF-county HLS cams inside the SF bbox", () => {
    const cams = parseFallbackSfCameras(fallbackFixture);
    expect(cams).toHaveLength(1);
    expect(cams[0]).toEqual<PinnedCamera>({
      caltransId: "TVD04--SFA",
      description: "US-101 N @ 6TH ST",
      lat: 37.7749,
      lng: -122.4194,
      streamUrl:
        "https://wzmedia.dot.ca.gov/D4/N101_at_6th.stream/playlist.m3u8",
    });
  });

  it("returns [] for an empty feed", () => {
    expect(parseFallbackSfCameras({ data: [] })).toEqual([]);
  });
});

describe("selectPinnedCameras", () => {
  it("prefers the DB path and caps at the limit", async () => {
    const fetchSpy = vi.fn();
    const cams = await selectPinnedCameras(
      {
        db: fakeDbReturning([SF_ROW, SF_ROW_2]) as never,
        fetch: fetchSpy as never,
      },
      { limit: 1 },
    );
    expect(cams).toHaveLength(1);
    expect(cams[0]!.caltransId).toBe("TVD04--SF1");
    expect(fetchSpy).not.toHaveBeenCalled(); // never hit fallback
  });

  it("force-pins specific ids in the requested order", async () => {
    const cams = await selectPinnedCameras(
      {
        db: fakeDbReturning([SF_ROW, SF_ROW_2]) as never,
        fetch: vi.fn() as never,
      },
      { caltransIds: ["TVD04--SF2", "TVD04--SF1"] },
    );
    expect(cams.map((c) => c.caltransId)).toEqual([
      "TVD04--SF2",
      "TVD04--SF1",
    ]);
  });

  it("falls back to the cwwp2 JSON when the DB is empty", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(fallbackFixture), { status: 200 }),
      );

    const cams = await selectPinnedCameras(
      {
        db: fakeDbReturning([]) as never,
        fetch: fakeFetch as never,
        url: "https://caltrans/d4.json",
      },
      {},
    );

    expect(fakeFetch).toHaveBeenCalledWith(
      "https://caltrans/d4.json",
      expect.any(Object),
    );
    expect(cams).toHaveLength(1);
    expect(cams[0]!.caltransId).toBe("TVD04--SFA");
  });

  it("throws when the fallback feed errors", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(
      selectPinnedCameras({
        db: fakeDbReturning([]) as never,
        fetch: fakeFetch as never,
      }),
    ).rejects.toThrow(/503/);
  });
});
