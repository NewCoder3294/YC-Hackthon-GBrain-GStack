import { describe, it, expect } from "vitest";
import {
  nearestHotspot,
  matchHotspotByName,
  projectToViewport,
} from "./neighborhoods";

describe("nearestHotspot", () => {
  it("snaps exact Tenderloin centroid to Tenderloin", () => {
    expect(nearestHotspot(37.7838, -122.4144)).toBe("Tenderloin");
  });
  it("snaps a point near Bayview to Bayview Hunters Point", () => {
    expect(nearestHotspot(37.7335, -122.3893)).toBe("Bayview Hunters Point");
  });
  it("returns a known hotspot name for an arbitrary SF point", () => {
    expect(nearestHotspot(37.79, -122.41)).toBe("Chinatown");
  });
});

describe("matchHotspotByName", () => {
  it("matches case-insensitive substring", () => {
    expect(matchHotspotByName("the tenderloin district")).toBe("Tenderloin");
  });
  it("matches the bayview alias", () => {
    expect(matchHotspotByName("BAYVIEW")).toBe("Bayview Hunters Point");
  });
  it("returns null when nothing matches", () => {
    expect(matchHotspotByName("Atlantis")).toBeNull();
  });
});

describe("projectToViewport", () => {
  it("keeps points inside the configured box with padding", () => {
    const { x, y } = projectToViewport(37.7838, -122.4144, {
      width: 1000,
      height: 800,
      padding: 60,
    });
    expect(x).toBeGreaterThanOrEqual(60);
    expect(x).toBeLessThanOrEqual(940);
    expect(y).toBeGreaterThanOrEqual(60);
    expect(y).toBeLessThanOrEqual(740);
  });
  it("is deterministic", () => {
    const a = projectToViewport(37.76, -122.42, { width: 800, height: 600, padding: 40 });
    const b = projectToViewport(37.76, -122.42, { width: 800, height: 600, padding: 40 });
    expect(a).toEqual(b);
  });
  it("places a northern point above a southern point (lat inverted)", () => {
    const north = projectToViewport(37.80, -122.42, { width: 800, height: 600, padding: 40 });
    const south = projectToViewport(37.72, -122.42, { width: 800, height: 600, padding: 40 });
    expect(north.y).toBeLessThan(south.y);
  });
});
