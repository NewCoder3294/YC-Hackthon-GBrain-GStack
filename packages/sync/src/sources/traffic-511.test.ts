import { describe, it, expect, vi } from "vitest";
import { fetchTraffic511, TRAFFIC_511_SOURCE } from "./traffic-511";

function mockResponse(body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200 }),
  ) as never;
}

const DEPS_BASE = { apiKey: "test-key" };

describe("fetchTraffic511", () => {
  it("keeps events inside the SF bbox", async () => {
    const fetch = mockResponse({
      events: [
        {
          id: "ev-1",
          status: "ACTIVE",
          severity: "Major",
          headline: "Lane closure",
          event_type: "CONSTRUCTION",
          created: "2026-05-16T12:00:00Z",
          updated: "2026-05-16T13:00:00Z",
          geography: { type: "Point", coordinates: [-122.41, 37.78] },
          roads: [{ name: "US-101", direction: "N" }],
        },
      ],
    });
    const { rows } = await fetchTraffic511({ ...DEPS_BASE, fetch });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: TRAFFIC_511_SOURCE,
      sourceUid: "ev-1",
      kind: "traffic",
      severity: "high",
      lat: 37.78,
      lng: -122.41,
      geoPrecision: "exact",
    });
  });

  it("drops events entirely outside SF", async () => {
    const fetch = mockResponse({
      events: [
        {
          id: "ev-sj",
          severity: "Major",
          created: "2026-05-16T12:00:00Z",
          geography: { type: "Point", coordinates: [-121.95, 37.34] },
        },
      ],
    });
    const { rows } = await fetchTraffic511({ ...DEPS_BASE, fetch });
    expect(rows).toHaveLength(0);
  });

  it("includes LineString events that pass through SF", async () => {
    const fetch = mockResponse({
      events: [
        {
          id: "ev-line",
          created: "2026-05-16T12:00:00Z",
          severity: "Moderate",
          geography: {
            type: "LineString",
            coordinates: [
              [-121.95, 37.34], // San Jose
              [-122.41, 37.78], // SF
              [-122.6, 37.9], // Marin
            ],
          },
        },
      ],
    });
    const { rows } = await fetchTraffic511({ ...DEPS_BASE, fetch });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lng).toBeCloseTo(-122.41);
  });

  it("passes the api_key in the URL", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), { status: 200 }),
    ) as never;
    await fetchTraffic511({ apiKey: "abc-xyz", fetch });
    const calledUrl = (fetch as unknown as { mock: { calls: string[][] } }).mock
      .calls[0]![0]!;
    expect(calledUrl).toContain("api_key=abc-xyz");
    expect(calledUrl).toContain("api.511.org/traffic/events");
  });
});
