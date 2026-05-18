import { describe, it, expect, vi } from "vitest";
import { fetchPurpleAir, pm25ToAqi } from "./purpleair";

const NOW = new Date("2026-05-17T12:00:00Z");

function mockResponse(
  fields: string[],
  data: unknown[][],
) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ fields, data }),
  });
}

describe("pm25ToAqi", () => {
  it("maps clean air to AQI 0-50", () => {
    expect(pm25ToAqi(0)).toBeLessThanOrEqual(50);
    expect(pm25ToAqi(8)).toBeLessThanOrEqual(50);
  });
  it("maps wildfire-smoke PM2.5 to 151+", () => {
    expect(pm25ToAqi(80)).toBeGreaterThan(150);
  });
  it("clamps at 500 for extreme PM2.5", () => {
    expect(pm25ToAqi(900)).toBe(500);
  });
});

describe("fetchPurpleAir", () => {
  it("returns disabled when no api key is set", async () => {
    // Defensive: don't fall back to process.env in the test.
    const originalKey = process.env.PURPLEAIR_API_KEY;
    delete process.env.PURPLEAIR_API_KEY;
    try {
      const result = await fetchPurpleAir({});
      expect(result.disabled).toBe(true);
      expect(result.attempted).toBe(0);
      expect(result.averageAqi).toBeNull();
    } finally {
      if (originalKey) process.env.PURPLEAIR_API_KEY = originalKey;
    }
  });

  it("upserts each SF sensor and emits a city-average row", async () => {
    const fetchImpl = mockResponse(
      ["sensor_index", "name", "latitude", "longitude", "pm2.5_atm", "last_seen", "location_type"],
      [
        [101, "Mission St", 37.7599, -122.4148, 9.5, 1747483200, 0],
        [102, "Tenderloin", 37.7849, -122.4128, 22.0, 1747483200, 0],
      ],
    );
    const result = await fetchPurpleAir({
      apiKey: "k",
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });
    expect(result.attempted).toBe(2);
    // 2 sensor rows + 1 average row
    expect(result.rows).toHaveLength(3);
    expect(result.averageAqi).not.toBeNull();
    const avgRow = result.rows.find((r) => r.sourceUid === "sf-avg");
    expect(avgRow).toBeDefined();
    expect(avgRow!.kind).toBe("aqi");
    expect(avgRow!.title).toMatch(/^SF Avg AQI/);
  });

  it("drops sensors outside the SF bbox", async () => {
    const fetchImpl = mockResponse(
      ["sensor_index", "name", "latitude", "longitude", "pm2.5_atm", "last_seen", "location_type"],
      [
        // Oakland — outside SF bbox.
        [201, "Lake Merritt", 37.8044, -122.2712, 12.0, 1747483200, 0],
      ],
    );
    const result = await fetchPurpleAir({
      apiKey: "k",
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });
    expect(result.attempted).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.rows).toHaveLength(0);
    expect(result.averageAqi).toBeNull();
  });

  it("throws when PurpleAir responds non-200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "bad key",
    });
    await expect(
      fetchPurpleAir({
        apiKey: "k",
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/purpleair 401/);
  });

  it("escalates severity above AQI 150", async () => {
    const fetchImpl = mockResponse(
      ["sensor_index", "name", "latitude", "longitude", "pm2.5_atm", "last_seen", "location_type"],
      [[301, "Smoke", 37.77, -122.42, 90, 1747483200, 0]],
    );
    const result = await fetchPurpleAir({
      apiKey: "k",
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });
    const sensorRow = result.rows.find((r) => r.sourceUid === "sensor-301");
    expect(sensorRow?.severity).toBe("high");
  });
});
