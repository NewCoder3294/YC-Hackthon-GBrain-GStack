import { describe, it, expect, vi } from "vitest";
import { fetchUsgsQuakes } from "./usgs-quakes";

function makeQuake(overrides: {
  id: string;
  mag: number;
  lng: number;
  lat: number;
  time?: number;
  place?: string;
}) {
  return {
    id: overrides.id,
    type: "Feature",
    properties: {
      mag: overrides.mag,
      place: overrides.place ?? "8km E of Berkeley, CA",
      time: overrides.time ?? Date.UTC(2026, 4, 17, 12, 0, 0),
      type: "earthquake",
    },
    geometry: {
      type: "Point",
      coordinates: [overrides.lng, overrides.lat, 8.0],
    },
  };
}

function mockOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

describe("fetchUsgsQuakes", () => {
  it("maps a Bay Area M3.2 quake to a med-severity env_signal", async () => {
    const fetchImpl = mockOk({
      features: [makeQuake({ id: "nc73000001", mag: 3.2, lng: -122.27, lat: 37.87 })],
    });
    const result = await fetchUsgsQuakes({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.attempted).toBe(1);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.kind).toBe("quake");
    expect(row.source).toBe("usgs_quakes");
    expect(row.severity).toBe("med");
    expect(row.title).toBe("M3.2 earthquake");
    expect(row.lat).toBeCloseTo(37.87, 2);
    expect(row.lng).toBeCloseTo(-122.27, 2);
  });

  it("escalates M>=4.0 to high severity", async () => {
    const fetchImpl = mockOk({
      features: [makeQuake({ id: "big", mag: 4.7, lng: -122.4, lat: 37.78 })],
    });
    const result = await fetchUsgsQuakes({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.rows[0]!.severity).toBe("high");
  });

  it("drops quakes outside the Bay Area bbox", async () => {
    const fetchImpl = mockOk({
      features: [
        // Anza-Borrego — far outside Bay Area
        makeQuake({ id: "far", mag: 5.0, lng: -116.5, lat: 33.5 }),
      ],
    });
    const result = await fetchUsgsQuakes({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.attempted).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.rows).toHaveLength(0);
  });

  it("drops features missing magnitude, time, or coordinates", async () => {
    const fetchImpl = mockOk({
      features: [
        // No mag.
        {
          id: "a",
          type: "Feature",
          properties: { mag: null, time: Date.now(), place: "x" },
          geometry: { type: "Point", coordinates: [-122.4, 37.78] },
        },
        // No coords.
        {
          id: "b",
          type: "Feature",
          properties: { mag: 2.0, time: Date.now(), place: "x" },
          geometry: { type: "Point", coordinates: [] },
        },
      ],
    });
    const result = await fetchUsgsQuakes({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.dropped).toBe(2);
    expect(result.rows).toHaveLength(0);
  });

  it("throws when USGS responds non-200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "down",
    });
    await expect(
      fetchUsgsQuakes({ fetch: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/usgs_quakes 502/);
  });
});
