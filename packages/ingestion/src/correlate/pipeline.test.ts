import { describe, it, expect } from "vitest";
import { correlate, type DatasfBaselineRow } from "./pipeline";
import { deterministicAdjudicator } from "./adjudicate";
import type { RawRow } from "./window";

const NOW = new Date("2026-05-16T12:00:00.000Z");
const mins = (m: number): Date => new Date(NOW.getTime() - m * 60_000);

function datasf(n: number): DatasfBaselineRow[] {
  return Array.from({ length: n }, (_, i) => ({
    occurredAt: new Date(NOW.getTime() - (i + 1) * 86_400_000).toISOString(),
    lat: 37.76,
    lng: -122.41,
    neighborhood: "Mission",
    category: "Assault",
    resolution: "Open or Active",
  }));
}

function row(p: Partial<RawRow> & { id: string }): RawRow {
  return {
    id: p.id,
    sourceType: p.sourceType ?? "camera_public",
    occurredAt: p.occurredAt ?? mins(10),
    lat: p.lat ?? 37.76,
    lng: p.lng ?? -122.41,
    payload: p.payload ?? { category: "Assault" },
    confidence: p.confidence ?? 0.8,
  };
}

describe("correlate (pure core)", () => {
  it("correlates a multi-source burst into one ranked incident", async () => {
    const { ranked, pages, stats } = await correlate({
      datasfRows: datasf(20),
      liveRows: [
        row({ id: "cam1", sourceType: "camera_public", occurredAt: mins(9) }),
        row({
          id: "call1",
          sourceType: "call_911",
          occurredAt: mins(7),
          lat: 37.7601,
        }),
      ],
      now: NOW,
      adjudicator: deterministicAdjudicator,
    });
    expect(stats.liveSignals).toBe(2);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.factors.degraded).toBe(false);
    expect(ranked[0]!.rationale.length).toBeGreaterThan(5);
    expect(pages[0]!.type).toBe("incident");
  });

  it("degrades when there is no baseline context", async () => {
    const { ranked } = await correlate({
      datasfRows: [],
      liveRows: [row({ id: "x", lat: 37.99, lng: -122.99 })],
      now: NOW,
      adjudicator: deterministicAdjudicator,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.factors.degraded).toBe(true);
  });

  it("applies an adjudicator merge on a near-radius same-group pair", async () => {
    const { ranked, stats } = await correlate({
      datasfRows: datasf(10),
      liveRows: [
        row({ id: "a", lat: 37.76, lng: -122.41, occurredAt: mins(5) }),
        // ~190 m away, same affinity group, within time → ambiguous
        // "category-match-near-radius" → deterministic resolve = merge.
        row({ id: "b", lat: 37.7617, lng: -122.41, occurredAt: mins(4) }),
      ],
      now: NOW,
      adjudicator: deterministicAdjudicator,
    });
    expect(stats.ambiguousResolved).toBe(1);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.cluster.signals.map((s) => s.id).sort()).toEqual([
      "a",
      "b",
    ]);
  });
});
