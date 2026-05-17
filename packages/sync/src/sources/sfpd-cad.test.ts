import { describe, it, expect, vi } from "vitest";
import { fetchSFPDCad, SFPD_CAD_SOURCE } from "./sfpd-cad";

function mockResponse(body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200 }),
  ) as never;
}

describe("fetchSFPDCad", () => {
  it("parses calls with intersection_point as exact geo", async () => {
    const fetch = mockResponse([
      {
        cad_number: "CAD-001",
        received_datetime: "2026-05-16T14:00:00.000",
        call_type_original: "917",
        call_type_original_desc: "Suspicious person",
        priority_original: "C",
        intersection_point: { type: "Point", coordinates: [-122.41, 37.78] },
        analysis_neighborhood: "Tenderloin",
        intersection_name: "Leavenworth & Turk",
      },
    ]);
    const { rows } = await fetchSFPDCad({ fetch });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: SFPD_CAD_SOURCE,
      sourceUid: "CAD-001",
      kind: "police",
      title: "Suspicious person",
      severity: "med",
      priority: "C",
      lat: 37.78,
      lng: -122.41,
      geoPrecision: "intersection",
      neighborhood: "Tenderloin",
    });
  });

  it("falls back to neighborhood centroid with neighborhood precision", async () => {
    const fetch = mockResponse([
      {
        cad_number: "CAD-002",
        received_datetime: "2026-05-16T14:01:00.000",
        call_type_original_desc: "Battery",
        priority_original: "A",
        analysis_neighborhood: "Mission",
      },
    ]);
    const { rows } = await fetchSFPDCad({ fetch });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.geoPrecision).toBe("neighborhood");
    expect(rows[0]?.severity).toBe("high");
    expect(rows[0]?.lat).toBeCloseTo(37.7599, 3);
  });

  it("drops rows with no usable geo (neither point nor known neighborhood)", async () => {
    const fetch = mockResponse([
      {
        cad_number: "CAD-003",
        received_datetime: "2026-05-16T14:02:00.000",
        call_type_original_desc: "Welfare check",
        analysis_neighborhood: "Atlantis",
      },
    ]);
    const { rows } = await fetchSFPDCad({ fetch });
    expect(rows).toHaveLength(0);
  });

  it("drops sensitive calls", async () => {
    const fetch = mockResponse([
      {
        cad_number: "CAD-004",
        received_datetime: "2026-05-16T14:03:00.000",
        call_type_original_desc: "Suicide attempt",
        intersection_point: { type: "Point", coordinates: [-122.41, 37.78] },
        sensitive_call: "true",
      },
    ]);
    const { rows } = await fetchSFPDCad({ fetch });
    expect(rows).toHaveLength(0);
  });

  it("tracks the highest occurredAt as the high water mark (PT-aware)", async () => {
    const fetch = mockResponse([
      {
        cad_number: "CAD-A",
        received_datetime: "2026-05-16T14:00:00.000",
        intersection_point: { type: "Point", coordinates: [-122.41, 37.78] },
      },
      {
        cad_number: "CAD-B",
        received_datetime: "2026-05-16T14:30:00.000",
        intersection_point: { type: "Point", coordinates: [-122.41, 37.78] },
      },
    ]);
    const { highWaterMark } = await fetchSFPDCad({ fetch });
    // 14:30 PT (PDT, UTC-7) = 21:30 UTC.
    expect(highWaterMark?.toISOString()).toBe("2026-05-16T21:30:00.000Z");
  });

  it("translates `since` from UTC to PT-naive in the $where clause", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response("[]", { status: 200 }),
    ) as never;
    // 00:00 UTC in May = 17:00 PT the previous day.
    await fetchSFPDCad({ fetch }, { since: "2026-05-15T00:00:00.000Z" });
    const calledUrl = (fetch as unknown as { mock: { calls: string[][] } }).mock
      .calls[0]![0]!;
    expect(calledUrl).toContain(
      "received_datetime+%3E+%272026-05-14T17%3A00%3A00.000%27",
    );
  });
});
