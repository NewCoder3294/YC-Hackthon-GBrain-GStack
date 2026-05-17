import { describe, it, expect } from "vitest";
import {
  classifyCategory,
  normalizeSignal,
  selectWindow,
  type RawRow,
} from "./window";
import type { Centroid, LiveSignal } from "./types";

const NOW = new Date("2026-05-16T12:00:00.000Z");
const centroids: Centroid[] = [
  { neighborhood: "Mission", lat: 37.76, lng: -122.41 },
];

describe("classifyCategory", () => {
  it("maps weapons text to weapons-violence sev 1.0", () => {
    expect(classifyCategory("Weapons Offense")).toEqual({
      category: "Weapons Offense",
      affinityGroup: "weapons-violence",
      severity: 1.0,
    });
  });
  it("falls back to unknown", () => {
    const c = classifyCategory("Lost Property");
    expect(c.affinityGroup).toBe("unknown");
    expect(c.severity).toBe(0.3);
  });
});

function raw(p: Partial<RawRow>): RawRow {
  return {
    id: p.id ?? "s1",
    sourceType: p.sourceType ?? "call_911",
    occurredAt: p.occurredAt ?? NOW.toISOString(),
    lat: p.lat ?? 37.7601,
    lng: p.lng ?? -122.4101,
    payload: p.payload ?? {},
    confidence: p.confidence ?? null,
  };
}

describe("normalizeSignal", () => {
  it("maps a datasf row (feed → datasf, payload neighborhood)", () => {
    const s = normalizeSignal(
      raw({
        sourceType: "call_911",
        payload: {
          feed: "datasf_sfpd_incidents",
          category: "Robbery",
          neighborhood: "Bayview Hunters Point",
        },
      }),
      centroids,
    );
    expect(s?.source).toBe("datasf");
    expect(s?.feed).toBe("datasf_sfpd_incidents");
    expect(s?.affinityGroup).toBe("robbery");
    expect(s?.neighborhood).toBe("Bayview Hunters Point");
  });

  it("assigns neighborhood by nearest centroid when payload lacks one", () => {
    const s = normalizeSignal(
      raw({ sourceType: "camera_public", payload: { category: "person" } }),
      centroids,
    );
    expect(s?.source).toBe("camera");
    expect(s?.neighborhood).toBe("Mission");
  });

  it("defaults confidence and rejects bad geo", () => {
    const s = normalizeSignal(raw({ confidence: null }), centroids);
    expect(s?.confidence).toBe(0.5);
    expect(normalizeSignal(raw({ lat: 999 }), centroids)).toBeNull();
  });
});

describe("selectWindow", () => {
  it("keeps only signals within the window", () => {
    const mk = (iso: string): LiveSignal => ({
      id: iso,
      source: "call_911",
      sourceType: "call_911",
      feed: null,
      occurredAt: iso,
      lat: 0,
      lng: 0,
      category: "x",
      affinityGroup: "unknown",
      confidence: 0.5,
      neighborhood: "Mission",
      summary: "x",
    });
    const inWin = mk("2026-05-16T06:00:00.000Z");
    const old = mk("2026-05-10T06:00:00.000Z");
    const got = selectWindow([inWin, old], NOW, 48);
    expect(got).toEqual([inWin]);
  });
});
