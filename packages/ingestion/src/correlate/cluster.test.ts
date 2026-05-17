import { describe, it, expect } from "vitest";
import { cluster, fnv1a } from "./cluster";
import type { LiveSignal } from "./types";

const BASE = new Date("2026-05-16T12:00:00.000Z").getTime();

function sig(p: Partial<LiveSignal> & { id: string }): LiveSignal {
  return {
    id: p.id,
    source: p.source ?? "call_911",
    sourceType: p.sourceType ?? "call_911",
    feed: p.feed ?? null,
    occurredAt:
      p.occurredAt ?? new Date(BASE).toISOString(),
    lat: p.lat ?? 37.76,
    lng: p.lng ?? -122.41,
    category: p.category ?? "Assault",
    affinityGroup: p.affinityGroup ?? "assault",
    confidence: p.confidence ?? 0.5,
    neighborhood: p.neighborhood ?? "Mission",
    summary: p.summary ?? "x",
  };
}
const minsLater = (m: number): string =>
  new Date(BASE + m * 60_000).toISOString();

describe("cluster", () => {
  it("merges two close same-group signals into one cluster", () => {
    const { clusters, ambiguous } = cluster([
      sig({ id: "a", lat: 37.76, lng: -122.41 }),
      sig({ id: "b", lat: 37.7601, lng: -122.4101, occurredAt: minsLater(2) }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.signals.map((s) => s.id)).toEqual(["a", "b"]);
    expect(ambiguous).toHaveLength(0);
  });

  it("splits signals beyond the radius", () => {
    const { clusters } = cluster([
      sig({ id: "a", lat: 37.76, lng: -122.41 }),
      sig({ id: "b", lat: 37.78, lng: -122.44 }),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("splits same-place signals beyond the time gap", () => {
    const { clusters } = cluster([
      sig({ id: "a" }),
      sig({ id: "b", occurredAt: minsLater(45) }),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("flags in-radius different-group as ambiguous (not merged)", () => {
    const { clusters, ambiguous } = cluster([
      sig({ id: "a", affinityGroup: "assault" }),
      sig({
        id: "b",
        lat: 37.7601,
        lng: -122.4101,
        affinityGroup: "property",
        occurredAt: minsLater(1),
      }),
    ]);
    expect(clusters).toHaveLength(2);
    expect(ambiguous[0]).toMatchObject({
      signalId: "b",
      reason: "category-mismatch-in-radius",
    });
  });

  it("flags just-outside-radius same-group as ambiguous", () => {
    const { ambiguous } = cluster([
      sig({ id: "a", lat: 37.76, lng: -122.41 }),
      // ~190 m away (RADIUS_M=150, 1.5x=225) same group → near-radius.
      sig({
        id: "b",
        lat: 37.7617,
        lng: -122.41,
        occurredAt: minsLater(1),
      }),
    ]);
    expect(ambiguous[0]).toMatchObject({
      signalId: "b",
      reason: "category-match-near-radius",
    });
  });

  it("marks hasDatasfDup when datasf + call_911 share a cluster", () => {
    const { clusters } = cluster([
      sig({ id: "a", source: "call_911" }),
      sig({
        id: "b",
        source: "datasf",
        feed: "datasf_sfpd_incidents",
        occurredAt: minsLater(3),
        lat: 37.7601,
      }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.hasDatasfDup).toBe(true);
  });

  it("produces a deterministic id regardless of input order", () => {
    const a = sig({ id: "a" });
    const b = sig({ id: "b", lat: 37.7601, occurredAt: minsLater(1) });
    const id1 = cluster([a, b]).clusters[0]!.id;
    const id2 = cluster([b, a]).clusters[0]!.id;
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^incident-[0-9a-f]{8}$/);
  });

  it("fnv1a is stable", () => {
    expect(fnv1a("a,b")).toBe(fnv1a("a,b"));
    expect(fnv1a("a,b")).not.toBe(fnv1a("b,a"));
  });
});
