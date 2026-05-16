import { describe, it, expect, vi } from "vitest";
import { syncCameras } from "./sync.js";
import type { NewCamera } from "@caltrans/db";

const sample: NewCamera = {
  caltransId: "TVD04--001",
  district: 4,
  route: "I-880",
  direction: "N",
  mileMarker: "32.10",
  description: "I-880 N @ 23RD AVE",
  lat: 37.789,
  lng: -122.234,
  streamUrl: "https://example.com/playlist.m3u8",
  streamType: "hls",
  isActive: true,
};

describe("syncCameras", () => {
  it("fetches, parses, and upserts cameras", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              cctv: {
                index: sample.caltransId,
                recordTimestamp: { recordDate: "", recordTime: "" },
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
                  streamingVideoURL: sample.streamUrl,
                  static: { currentImageURL: "" },
                },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const upserts: NewCamera[] = [];
    const fakeDb = {
      insert: () => ({
        values: (rows: NewCamera[]) => ({
          onConflictDoUpdate: () => {
            upserts.push(...rows);
            return Promise.resolve();
          },
        }),
      }),
    };

    const result = await syncCameras({
      db: fakeDb as never,
      fetch: fakeFetch as never,
      url: "https://caltrans/d4.json",
    });

    expect(result.count).toBe(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      caltransId: "TVD04--001",
      route: "I-880",
      streamType: "hls",
    });
    expect(fakeFetch).toHaveBeenCalledWith("https://caltrans/d4.json", expect.any(Object));
  });

  it("throws on non-200 response", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(
      syncCameras({
        db: {} as never,
        fetch: fakeFetch as never,
        url: "https://x",
      }),
    ).rejects.toThrow(/503/);
  });
});
