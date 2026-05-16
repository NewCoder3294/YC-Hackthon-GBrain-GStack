import { describe, expect, it } from "vitest";
import { isHighPriority, normalizeDispatchCalls, priorityLabel } from "./dispatch";

const FIXTURE_OK = [
  {
    id: "39032836",
    cad_number: "261342053",
    received_datetime: "2026-05-14T13:58:25.000",
    call_type_original: "917",
    call_type_original_desc: "SUSPICIOUS PERSON",
    call_type_final: "917",
    call_type_final_desc: "SUSPICIOUS PERSON",
    priority_original: "C",
    priority_final: "B",
    agency: "Police",
    intersection_name: "LEAVENWORTH ST \\ TURK ST",
    intersection_point: { type: "Point", coordinates: [-122.414053765, 37.782794446] },
    analysis_neighborhood: "Tenderloin",
    police_district: "TENDERLOIN",
    disposition: "CIT",
  },
];

describe("normalizeDispatchCalls", () => {
  it("maps raw SODA records to DispatchCall shape", () => {
    const result = normalizeDispatchCalls(FIXTURE_OK);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "39032836",
      callNumber: "261342053",
      callType: "SUSPICIOUS PERSON",
      callTypeCode: "917",
      priority: "B",
      address: "LEAVENWORTH ST & TURK ST",
      neighborhood: "Tenderloin",
      district: "TENDERLOIN",
      lat: 37.782794446,
      lng: -122.414053765,
    });
  });

  it("skips calls without intersection_point", () => {
    const noPoint = [{ ...FIXTURE_OK[0], intersection_point: undefined }];
    expect(normalizeDispatchCalls(noPoint)).toEqual([]);
  });

  it("falls back to original fields when final fields missing", () => {
    const onlyOriginal = [
      {
        ...FIXTURE_OK[0],
        call_type_final: undefined,
        call_type_final_desc: undefined,
        priority_final: undefined,
      },
    ];
    const result = normalizeDispatchCalls(onlyOriginal);
    expect(result).toHaveLength(1);
    const r = result[0]!;
    expect(r.callType).toBe("SUSPICIOUS PERSON");
    expect(r.priority).toBe("C");
  });

  it("returns empty on non-array input", () => {
    expect(normalizeDispatchCalls(null)).toEqual([]);
    expect(normalizeDispatchCalls({})).toEqual([]);
    expect(normalizeDispatchCalls("string")).toEqual([]);
  });
});

describe("priorityLabel", () => {
  it("labels known priorities", () => {
    expect(priorityLabel("A")).toMatch(/emergency/i);
    expect(priorityLabel("B")).toMatch(/urgent/i);
    expect(priorityLabel("C")).toMatch(/routine/i);
  });

  it("falls back for unknown priorities", () => {
    expect(priorityLabel("X")).toBe("Priority X");
    expect(priorityLabel("")).toBe("Unknown priority");
  });
});

describe("isHighPriority", () => {
  it("identifies A and B as high", () => {
    expect(isHighPriority("A")).toBe(true);
    expect(isHighPriority("B")).toBe(true);
    expect(isHighPriority("a")).toBe(true);
  });
  it("treats C/E/other as not high", () => {
    expect(isHighPriority("C")).toBe(false);
    expect(isHighPriority("E")).toBe(false);
    expect(isHighPriority("")).toBe(false);
  });
});
