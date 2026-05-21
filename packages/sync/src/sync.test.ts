import { describe, it, expect, vi } from "vitest";
import { cameras, cameraSurfaces, type NewCameraSurface } from "@caltrans/db";
import { syncCameras } from "./sync";
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
  streamUrl: "https://example.com/camera.jpg",
  streamType: "mjpeg",
  stillImageUrl: "https://example.com/camera.jpg",
  providerMetadata: {
    hlsUrl: "https://example.com/playlist.m3u8",
    hasHls: true,
    stillImageUrl: "https://example.com/camera.jpg",
  },
  isActive: true,
};

describe("syncCameras", () => {
  it("fetches ArcGIS inventory and upserts cameras plus surfaces", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              attributes: {
                OBJECTID: 10,
                index_: 1,
                district: 4,
                county: "Alameda",
                route: "I-880",
                direction: "North",
                postmile: 32.1,
                locationName: "I-880 N @ 23RD AVE",
                nearbyPlace: "23RD AVE",
                inService: "True",
                imageDescription: "I-880 N @ 23RD AVE",
                streamingVideoURL: "https://example.com/playlist.m3u8",
                currentImageURL: sample.streamUrl,
                currentImageUpdateFrequency: "5",
                latitude: 37.789,
                longitude: -122.234,
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const upserts: NewCamera[] = [];
    const surfaceUpserts: NewCameraSurface[] = [];
    const mockDb = {
      insert: (table: unknown) => ({
        values: (rows: NewCamera[] | NewCameraSurface[]) => ({
          onConflictDoUpdate: () => {
            if (table === cameras) upserts.push(...(rows as NewCamera[]));
            if (table === cameraSurfaces) {
              surfaceUpserts.push(...(rows as NewCameraSurface[]));
            }
            return Promise.resolve();
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve(
              upserts.map((row, i) => ({
                id: `camera-${i + 1}`,
                caltransId: row.caltransId,
              })),
            ),
        }),
      }),
    };

    const result = await syncCameras({
      db: mockDb as never,
      fetch: mockFetch as never,
      arcgisUrl: "https://caltrans/arcgis",
      cwwp2Url: null,
    });

    expect(result.count).toBe(1);
    expect(result.surfaces).toBe(2);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      caltransId: "D4-1",
      route: "I-880",
      streamType: "mjpeg",
      streamUrl: "https://example.com/camera.jpg",
      stillImageUrl: "https://example.com/camera.jpg",
    });
    expect(surfaceUpserts).toEqual([
      expect.objectContaining({
        cameraId: "camera-1",
        kind: "still",
        url: "https://example.com/camera.jpg",
      }),
      expect.objectContaining({
        cameraId: "camera-1",
        kind: "hls",
        url: "https://example.com/playlist.m3u8",
      }),
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://caltrans/arcgis",
      expect.any(Object),
    );
  });

  it("uses CWWP2 only to fill missing ArcGIS surfaces", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            features: [
              {
                attributes: {
                  index_: 1,
                  district: 4,
                  county: "Alameda",
                  route: "I-880",
                  direction: "North",
                  postmile: 32.1,
                  locationName: "I-880 N @ 23RD AVE",
                  inService: "True",
                  imageDescription: "I-880 N @ 23RD AVE",
                  streamingVideoURL: "",
                  currentImageURL: "",
                  latitude: 37.789,
                  longitude: -122.234,
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                cctv: {
                  index: "1",
                  location: {
                    district: "04",
                    route: "I-880",
                    direction: "North",
                    nearbyPlace: "23RD AVE",
                    longitude: "-122.234",
                    latitude: "37.789",
                    milepost: "32.10",
                  },
                  inService: "True",
                  imageData: {
                    imageDescription: "I-880 N @ 23RD AVE",
                    streamingVideoURL: "https://example.com/live.m3u8",
                    static: { currentImageURL: "https://example.com/still.jpg" },
                  },
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const upserts: NewCamera[] = [];
    const surfaceUpserts: NewCameraSurface[] = [];
    const mockDb = {
      insert: (table: unknown) => ({
        values: (rows: NewCamera[] | NewCameraSurface[]) => ({
          onConflictDoUpdate: () => {
            if (table === cameras) upserts.push(...(rows as NewCamera[]));
            if (table === cameraSurfaces) {
              surfaceUpserts.push(...(rows as NewCameraSurface[]));
            }
            return Promise.resolve();
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve(
              upserts.map((row, i) => ({
                id: `camera-${i + 1}`,
                caltransId: row.caltransId,
              })),
            ),
        }),
      }),
    };

    const result = await syncCameras({
      db: mockDb as never,
      fetch: mockFetch as never,
      arcgisUrl: "https://caltrans/arcgis",
      cwwp2Url: "https://caltrans/cwwp2",
    });

    expect(result.count).toBe(1);
    expect(result.enriched).toBe(1);
    expect(upserts[0]).toMatchObject({
      caltransId: "D4-1",
      streamType: "mjpeg",
      streamUrl: "https://example.com/still.jpg",
      stillImageUrl: "https://example.com/still.jpg",
    });
    expect(surfaceUpserts).toEqual([
      expect.objectContaining({
        provider: "caltrans_cwwp2",
        kind: "still",
        url: "https://example.com/still.jpg",
      }),
      expect.objectContaining({
        provider: "caltrans_cwwp2",
        kind: "hls",
        url: "https://example.com/live.m3u8",
      }),
    ]);
  });

  it("throws on non-200 response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(
      syncCameras({
        db: {} as never,
        fetch: mockFetch as never,
        url: "https://x",
      }),
    ).rejects.toThrow(/503/);
  });
});
