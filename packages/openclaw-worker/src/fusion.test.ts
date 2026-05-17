import { describe, it, expect } from "vitest";
import {
  clusterSignals,
  haversineMeters,
  severityFor,
  type FusionEvent,
} from "./fusion";

function ev(overrides: Partial<FusionEvent>): FusionEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    sourceType: "camera_public",
    sourceId: "cam-1",
    occurredAt: new Date(),
    lat: 37.7649,
    lng: -122.4194,
    payload: {},
    confidence: 0.7,
    ...overrides,
  };
}

const MISSION = { lat: 37.7649, lng: -122.4194 };
const TENDERLOIN = { lat: 37.7836, lng: -122.4131 };

describe("haversineMeters", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMeters(37.7649, -122.4194, 37.7649, -122.4194)).toBeLessThan(1);
  });

  it("approximates known SF distances", () => {
    // Mission & 16th → Tenderloin ≈ 1.5 km
    const d = haversineMeters(MISSION.lat, MISSION.lng, TENDERLOIN.lat, TENDERLOIN.lng);
    expect(d).toBeGreaterThan(1_500);
    expect(d).toBeLessThan(2_500);
  });
});

describe("clusterSignals", () => {
  const opts = { windowS: 90, radiusM: 300, minSignals: 2 };

  it("returns empty when no signals", () => {
    expect(clusterSignals([], opts)).toEqual([]);
  });

  it("requires >= minSignals to fire a cluster", () => {
    const events = [ev({ ...MISSION })];
    expect(clusterSignals(events, opts)).toHaveLength(0);
  });

  it("fuses three signals at the same corner within 60s into one cluster", () => {
    const t0 = new Date("2026-05-16T22:00:00Z");
    const events: FusionEvent[] = [
      ev({ id: "a", sourceType: "camera_public", occurredAt: t0, ...MISSION }),
      ev({
        id: "b",
        sourceType: "call_911",
        occurredAt: new Date(t0.getTime() + 11_000),
        ...MISSION,
      }),
      ev({
        id: "c",
        sourceType: "citizen_report",
        occurredAt: new Date(t0.getTime() + 60_000),
        ...MISSION,
      }),
    ];
    const clusters = clusterSignals(events, opts);
    expect(clusters).toHaveLength(1);
    const c0 = clusters[0]!;
    expect(c0.members).toHaveLength(3);
    expect(Object.keys(c0.sourceTypeCounts).sort()).toEqual([
      "call_911",
      "camera_public",
      "citizen_report",
    ]);
    // Deterministic key — recomputing on same set returns same key.
    const again = clusterSignals(events, opts);
    expect(again[0]!.fusionKey).toBe(c0.fusionKey);
  });

  it("does not fuse signals from different neighborhoods", () => {
    const t0 = new Date();
    const events: FusionEvent[] = [
      ev({ id: "a", sourceType: "camera_public", occurredAt: t0, ...MISSION }),
      ev({ id: "b", sourceType: "call_911", occurredAt: t0, ...TENDERLOIN }),
    ];
    const clusters = clusterSignals(events, opts);
    expect(clusters).toHaveLength(0);
  });

  it("does not fuse signals beyond the time window", () => {
    const t0 = new Date("2026-05-16T22:00:00Z");
    const events: FusionEvent[] = [
      ev({ id: "a", sourceType: "camera_public", occurredAt: t0, ...MISSION }),
      ev({
        id: "b",
        sourceType: "call_911",
        // 10 minutes later — outside 90s window
        occurredAt: new Date(t0.getTime() + 600_000),
        ...MISSION,
      }),
    ];
    const clusters = clusterSignals(events, opts);
    expect(clusters).toHaveLength(0);
  });

  it("centroid drifts toward additional members", () => {
    const t0 = new Date();
    const a = ev({ id: "a", occurredAt: t0, lat: 37.76, lng: -122.42 });
    const b = ev({
      id: "b",
      sourceType: "call_911",
      occurredAt: new Date(t0.getTime() + 1_000),
      lat: 37.762,
      lng: -122.418,
    });
    const clusters = clusterSignals([a, b], opts);
    const cluster = clusters[0]!;
    expect(cluster.centroidLat).toBeCloseTo(37.761, 3);
    expect(cluster.centroidLng).toBeCloseTo(-122.419, 3);
  });
});

describe("severityFor", () => {
  it("3 distinct source types → high", () => {
    const sev = severityFor({
      fusionKey: "k",
      centroidLat: 0,
      centroidLng: 0,
      earliestAt: new Date(),
      latestAt: new Date(),
      members: [],
      sourceTypeCounts: { camera_public: 1, call_911: 1, citizen_report: 1 },
    });
    expect(sev).toBe("high");
  });

  it("cam + 911 with high confidence → high", () => {
    const sev = severityFor({
      fusionKey: "k",
      centroidLat: 0,
      centroidLng: 0,
      earliestAt: new Date(),
      latestAt: new Date(),
      members: [
        ev({ sourceType: "camera_public", confidence: 0.85 }),
        ev({ sourceType: "call_911", confidence: 0.7 }),
      ],
      sourceTypeCounts: { camera_public: 1, call_911: 1 },
    });
    expect(sev).toBe("high");
  });

  it("cam + 911 with low confidence → med", () => {
    const sev = severityFor({
      fusionKey: "k",
      centroidLat: 0,
      centroidLng: 0,
      earliestAt: new Date(),
      latestAt: new Date(),
      members: [
        ev({ sourceType: "camera_public", confidence: 0.3 }),
        ev({ sourceType: "call_911", confidence: 0.4 }),
      ],
      sourceTypeCounts: { camera_public: 1, call_911: 1 },
    });
    expect(sev).toBe("med");
  });

  it("single source type → low", () => {
    const sev = severityFor({
      fusionKey: "k",
      centroidLat: 0,
      centroidLng: 0,
      earliestAt: new Date(),
      latestAt: new Date(),
      members: [ev({ confidence: 0.95 }), ev({ confidence: 0.9 })],
      sourceTypeCounts: { camera_public: 2 },
    });
    expect(sev).toBe("low");
  });
});
