import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAdsb, __resetAdsbTokenCache } from "./adsb";

// OpenSky state tuple — 18 indices. We only populate the ones we read.
// Indices: 0 icao24, 1 callsign, 4 last_contact, 5 lng, 6 lat,
//          7 baro_altitude, 8 on_ground, 9 velocity, 17 category.
function state(opts: {
  icao24: string;
  callsign?: string;
  lat: number;
  lng: number;
  altitudeM?: number | null;
  velocityMs?: number | null;
  onGround?: boolean;
  category?: number | null;
  lastContactUnix?: number;
}): unknown[] {
  const tuple: unknown[] = new Array(18).fill(null);
  tuple[0] = opts.icao24;
  tuple[1] = opts.callsign ?? null;
  tuple[4] = opts.lastContactUnix ?? Math.floor(Date.UTC(2026, 4, 17, 12) / 1000);
  tuple[5] = opts.lng;
  tuple[6] = opts.lat;
  tuple[7] = opts.altitudeM ?? null;
  tuple[8] = opts.onGround ?? false;
  tuple[9] = opts.velocityMs ?? null;
  tuple[17] = opts.category ?? null;
  return tuple;
}

function mockOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

describe("fetchAdsb", () => {
  beforeEach(() => {
    __resetAdsbTokenCache();
  });

  it("flags an aircraft with category=7 as a helicopter", async () => {
    const fetchImpl = mockOk({
      time: 0,
      states: [
        state({
          icao24: "abc123",
          callsign: "N911PD",
          lat: 37.78,
          lng: -122.42,
          altitudeM: 400,
          velocityMs: 25,
          category: 7,
        }),
      ],
    });
    const result = await fetchAdsb({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.helicopters).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.kind).toBe("aircraft");
    expect(result.rows[0]!.subtitle).toMatch(/helicopter/);
    expect(result.rows[0]!.severity).toBe("med");
  });

  it("classifies a slow low-altitude fixed-wing as a loiterer", async () => {
    const fetchImpl = mockOk({
      time: 0,
      states: [
        state({
          icao24: "loit01",
          callsign: "SURV1",
          lat: 37.78,
          lng: -122.42,
          altitudeM: 900,
          velocityMs: 60,
          category: 1, // Light fixed-wing
        }),
      ],
    });
    const result = await fetchAdsb({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.loiterers).toBe(1);
    expect(result.helicopters).toBe(0);
    expect(result.rows[0]!.subtitle).toMatch(/low-altitude loiter/);
  });

  it("drops normal commuter traffic (high + fast)", async () => {
    const fetchImpl = mockOk({
      time: 0,
      states: [
        state({
          icao24: "ual1",
          callsign: "UAL123",
          lat: 37.78,
          lng: -122.42,
          altitudeM: 9000,
          velocityMs: 240,
        }),
      ],
    });
    const result = await fetchAdsb({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.attempted).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.rows).toHaveLength(0);
  });

  it("drops aircraft outside the 25km radius (defensive)", async () => {
    const fetchImpl = mockOk({
      time: 0,
      states: [
        // San Jose — well outside 25km.
        state({
          icao24: "far1",
          lat: 37.36,
          lng: -121.93,
          altitudeM: 400,
          velocityMs: 30,
          category: 7,
        }),
      ],
    });
    const result = await fetchAdsb({
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result.attempted).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.rows).toHaveLength(0);
  });

  it("throws when OpenSky responds non-200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });
    await expect(
      fetchAdsb({ fetch: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/adsb_opensky 429/);
  });

  it("exchanges client credentials for a bearer token when provided", async () => {
    const fetchImpl = vi
      .fn()
      // 1st call: token endpoint
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-abc", expires_in: 1800 }),
      })
      // 2nd call: states endpoint
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ time: 0, states: [] }),
      });
    await fetchAdsb({
      fetch: fetchImpl as unknown as typeof fetch,
      clientId: "test-client",
      clientSecret: "test-secret",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const tokenCall = fetchImpl.mock.calls[0]!;
    expect(String(tokenCall[0])).toContain(
      "auth.opensky-network.org",
    );
    expect((tokenCall[1] as RequestInit | undefined)?.method).toBe("POST");
    const statesCall = fetchImpl.mock.calls[1]!;
    const statesInit = statesCall[1] as RequestInit | undefined;
    const auth = (statesInit?.headers as Record<string, string> | undefined)?.[
      "Authorization"
    ];
    expect(auth).toBe("Bearer tok-abc");
  });
});
