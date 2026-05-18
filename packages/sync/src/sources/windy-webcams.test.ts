import { describe, it, expect, vi } from "vitest";
import { syncWindyCameras } from "./windy-webcams";

interface MockAdmin {
  from: (table: string) => {
    upsert: ReturnType<typeof vi.fn>;
  };
}

function makeAdmin(): { admin: MockAdmin; upsert: ReturnType<typeof vi.fn> } {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const admin: MockAdmin = {
    from: () => ({ upsert }),
  };
  return { admin, upsert };
}

describe("syncWindyCameras", () => {
  it("returns disabled when no api key is provided", async () => {
    const { admin } = makeAdmin();
    const result = await syncWindyCameras(admin as never, { apiKey: undefined });
    expect(result.disabled).toBe(true);
    expect(result.attempted).toBe(0);
  });

  it("upserts a single SF-bbox webcam with provider_metadata", async () => {
    const { admin, upsert } = makeAdmin();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        webcams: [
          {
            webcamId: 1234,
            title: "Embarcadero",
            viewCount: 12000,
            status: "active",
            location: {
              latitude: 37.7943,
              longitude: -122.3946,
              city: "San Francisco",
              region: "CA",
              country: "USA",
            },
            images: { current: { preview: "https://i.windy.com/p/1234.jpg" } },
            player: {
              day: "https://embed.windy.com/embed.html?w=1234&t=day",
              live: null,
            },
          },
        ],
      }),
    });

    const result = await syncWindyCameras(admin as never, {
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.attempted).toBe(1);
    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0]![0]!;
    expect(args.source).toBe("windy");
    expect(args.caltrans_id).toBe("windy-1234");
    expect(args.stream_url).toBe(
      "https://embed.windy.com/embed.html?w=1234&t=day",
    );
    expect(args.provider_metadata.webcam_id).toBe(1234);
    expect(args.contributor_id).toBeNull();
  });

  it("skips webcams missing coords or outside the SF bbox", async () => {
    const { admin } = makeAdmin();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        webcams: [
          {
            webcamId: 1,
            title: "Oakland",
            location: { latitude: 37.8044, longitude: -122.2712 },
            images: { current: { preview: "x" } },
            player: { day: "y" },
          },
          {
            webcamId: 2,
            title: "no coords",
            location: { latitude: null, longitude: null },
            images: { current: { preview: "x" } },
            player: { day: "y" },
          },
        ],
      }),
    });
    const result = await syncWindyCameras(admin as never, {
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.attempted).toBe(2);
    expect(result.upserted).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("returns an error when Windy responds non-200", async () => {
    const { admin } = makeAdmin();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });
    await expect(
      syncWindyCameras(admin as never, {
        apiKey: "test-key",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/windy_api 429/);
  });
});
