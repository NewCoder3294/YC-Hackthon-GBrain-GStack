import { describe, it, expect } from "vitest";
import {
  mapIncidents,
  partitionNew,
  DATASF_FEED,
  DATASF_SOURCE_TYPE,
  DATASF_CONFIDENCE,
} from "./mapper";
import type { SignalEventInput } from "../signal-events";

const goodRow = {
  row_id: "12345678901234",
  incident_datetime: "2025-05-01T02:14:00.000",
  incident_id: "IID-1",
  incident_number: "250300001",
  incident_category: "Assault",
  incident_subcategory: "Aggravated Assault",
  incident_description: "Battery with serious injury",
  latitude: "37.7649",
  longitude: "-122.4194",
  police_district: "Mission",
  analysis_neighborhood: "Mission",
  resolution: "Open or Active",
  some_future_socrata_col: "ignored by passthrough",
};

describe("mapIncidents", () => {
  it("maps a valid row to the fixed contract", () => {
    const { events, skipped } = mapIncidents([goodRow]);
    expect(skipped).toBe(0);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.sourceType).toBe(DATASF_SOURCE_TYPE);
    expect(e.sourceType).toBe("call_911");
    expect(e.sourceId).toBe("12345678901234");
    expect(e.lat).toBeCloseTo(37.7649);
    expect(e.lng).toBeCloseTo(-122.4194);
    expect(e.confidence).toBe(DATASF_CONFIDENCE);
    expect((e.occurredAt as Date).toISOString()).toMatch(/^2025-05-01T/);
    expect(e.payload).toMatchObject({
      feed: DATASF_FEED,
      category: "Assault",
      subcategory: "Aggravated Assault",
      neighborhood: "Mission",
      policeDistrict: "Mission",
      resolution: "Open or Active",
    });
  });

  it("drops anonymized rows with null/empty lat or lng", () => {
    const { events, skipped } = mapIncidents([
      { ...goodRow, row_id: "a", latitude: "", longitude: "" },
      { ...goodRow, row_id: "b", latitude: undefined, longitude: undefined },
      { ...goodRow, row_id: "c" },
    ]);
    expect(events.map((e) => e.sourceId)).toEqual(["c"]);
    expect(skipped).toBe(2);
  });

  it("drops rows failing schema or with unparseable datetime", () => {
    const { events, skipped } = mapIncidents([
      { incident_datetime: "2025-01-01T00:00:00" }, // no row_id
      { ...goodRow, row_id: "x", incident_datetime: "not-a-date" },
      goodRow,
    ]);
    expect(events).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it("rejects out-of-range coordinates", () => {
    const { events, skipped } = mapIncidents([
      { ...goodRow, row_id: "oob", latitude: "999", longitude: "0" },
    ]);
    expect(events).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("nulls missing optional payload fields rather than dropping", () => {
    const { events } = mapIncidents([
      {
        row_id: "min",
        incident_datetime: "2025-05-01T00:00:00",
        latitude: "37.77",
        longitude: "-122.41",
      },
    ]);
    expect(events[0]!.payload).toMatchObject({
      feed: DATASF_FEED,
      category: null,
      description: null,
      resolution: null,
    });
  });
});

describe("partitionNew (idempotency)", () => {
  const ev = (id: string): SignalEventInput => ({
    sourceType: "call_911",
    sourceId: id,
    occurredAt: new Date("2025-05-01T00:00:00Z"),
    lat: 37.77,
    lng: -122.41,
    payload: { feed: DATASF_FEED },
    confidence: 1,
  });

  it("drops ids already in the DB", () => {
    const r = partitionNew([ev("a"), ev("b"), ev("c")], new Set(["b"]));
    expect(r.fresh.map((e) => e.sourceId)).toEqual(["a", "c"]);
    expect(r.duplicates).toBe(1);
  });

  it("drops within-batch duplicates so a single run is idempotent", () => {
    const r = partitionNew([ev("a"), ev("a"), ev("b")], new Set());
    expect(r.fresh.map((e) => e.sourceId)).toEqual(["a", "b"]);
    expect(r.duplicates).toBe(1);
  });

  it("re-run against a fully-known set yields zero fresh", () => {
    const r = partitionNew([ev("a"), ev("b")], new Set(["a", "b"]));
    expect(r.fresh).toHaveLength(0);
    expect(r.duplicates).toBe(2);
  });
});
