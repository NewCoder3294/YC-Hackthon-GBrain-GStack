import { describe, it, expect, vi } from "vitest";
import { fetchNwsAlerts } from "./nws-alerts";

// SF coords for one polygon vertex so the bbox-overlap check passes.
const SF_LNG = -122.4194;
const SF_LAT = 37.7749;

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: "urn:oid:2.49.0.1.840.0.x",
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [SF_LNG, SF_LAT],
          [SF_LNG + 0.05, SF_LAT],
          [SF_LNG, SF_LAT + 0.05],
          [SF_LNG, SF_LAT],
        ],
      ],
    },
    properties: {
      id: "urn:oid:2.49.0.1.840.0.x",
      event: "Wind Advisory",
      severity: "Moderate",
      sent: "2026-05-17T12:00:00Z",
      effective: "2026-05-17T12:00:00Z",
      expires: "2026-05-17T20:00:00Z",
      areaDesc: "San Francisco; San Mateo",
      geocode: { SAME: ["006075"], UGC: ["CAC075"] },
      ...overrides,
    },
  };
}

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

describe("fetchNwsAlerts", () => {
  it("maps a moderate SF wind advisory to a med-severity env_signal", async () => {
    const fetchImpl = mockFetchOk({ features: [makeAlert()] });
    const result = await fetchNwsAlerts({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.attempted).toBe(1);
    expect(result.dropped).toBe(0);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.kind).toBe("weather");
    expect(row.source).toBe("nws_alerts");
    expect(row.severity).toBe("med");
    expect(row.title).toBe("Wind Advisory");
    expect(row.subtitle).toContain("Moderate");
    expect(row.lat).toBeCloseTo(SF_LAT, 1);
    expect(row.lng).toBeCloseTo(SF_LNG, 1);
    expect(row.expiresAt).toBeInstanceOf(Date);
  });

  it("escalates Severe / Extreme to high severity", async () => {
    const fetchImpl = mockFetchOk({
      features: [
        makeAlert({ severity: "Severe", id: "a" }),
        makeAlert({ severity: "Extreme", id: "b" }),
      ],
    });
    const result = await fetchNwsAlerts({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.rows.every((r) => r.severity === "high")).toBe(true);
  });

  it("drops alerts whose geometry doesn't overlap SF and that don't list SF county", async () => {
    const fetchImpl = mockFetchOk({
      features: [
        // Eureka — far from SF, no SF SAME code.
        {
          id: "n",
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-124, 40.8],
                [-123.9, 40.8],
                [-123.9, 40.9],
                [-124, 40.8],
              ],
            ],
          },
          properties: {
            id: "n",
            event: "Coastal Flood Watch",
            severity: "Minor",
            sent: "2026-05-17T12:00:00Z",
            effective: "2026-05-17T12:00:00Z",
            areaDesc: "Humboldt County",
            geocode: { SAME: ["006023"], UGC: ["CAC023"] },
          },
        },
      ],
    });
    const result = await fetchNwsAlerts({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.attempted).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.rows).toHaveLength(0);
  });

  it("keeps an alert with no geometry if its SAME code includes SF county", async () => {
    const fetchImpl = mockFetchOk({
      features: [
        {
          id: "g",
          type: "Feature",
          geometry: null,
          properties: {
            id: "g",
            event: "Air Quality Alert",
            severity: "Minor",
            sent: "2026-05-17T12:00:00Z",
            effective: "2026-05-17T12:00:00Z",
            areaDesc: "San Francisco County",
            geocode: { SAME: ["006075"] },
          },
        },
      ],
    });
    const result = await fetchNwsAlerts({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.kind).toBe("weather");
  });

  it("throws when NWS responds non-200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "down",
    });
    await expect(
      fetchNwsAlerts({ fetch: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/nws_alerts 503/);
  });
});
