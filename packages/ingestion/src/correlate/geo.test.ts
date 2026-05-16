import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  centroidsFromSignals,
  nearestNeighborhood,
} from "./geo";

describe("haversineMeters", () => {
  it("measures a known SF span within 5%", () => {
    // SF City Hall → Ferry Building ≈ 2.88 km.
    const d = haversineMeters(37.7793, -122.4193, 37.7955, -122.3937);
    expect(d).toBeGreaterThan(2_750);
    expect(d).toBeLessThan(3_000);
  });
  it("is zero for the same point", () => {
    expect(haversineMeters(37.78, -122.41, 37.78, -122.41)).toBeCloseTo(0, 3);
  });
});

describe("centroidsFromSignals", () => {
  it("averages lat/lng per neighborhood and skips Unknown", () => {
    const c = centroidsFromSignals([
      { neighborhood: "Mission", lat: 37.76, lng: -122.41 },
      { neighborhood: "Mission", lat: 37.77, lng: -122.42 },
      { neighborhood: "Unknown", lat: 0, lng: 0 },
      { neighborhood: " ", lat: 1, lng: 1 },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].neighborhood).toBe("Mission");
    expect(c[0].lat).toBeCloseTo(37.765, 4);
    expect(c[0].lng).toBeCloseTo(-122.415, 4);
  });
});

describe("nearestNeighborhood", () => {
  const centroids = [
    { neighborhood: "Mission", lat: 37.76, lng: -122.41 },
    { neighborhood: "SOMA", lat: 37.78, lng: -122.4 },
  ];
  it("returns the closest centroid", () => {
    expect(nearestNeighborhood(37.7605, -122.4105, centroids)).toBe("Mission");
    expect(nearestNeighborhood(37.781, -122.401, centroids)).toBe("SOMA");
  });
  it("returns Unknown with no centroids", () => {
    expect(nearestNeighborhood(37.76, -122.41, [])).toBe("Unknown");
  });
});
