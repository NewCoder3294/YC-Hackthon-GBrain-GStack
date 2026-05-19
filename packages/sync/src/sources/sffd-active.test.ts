import { describe, it, expect, vi } from "vitest";
import { fetchSFFDActive, SFFD_ACTIVE_SOURCE } from "./sffd-active";

function mockResponse(body: unknown, status = 200): typeof globalThis.fetch {
  return vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status })) as never;
}

describe("fetchSFFDActive", () => {
  it("ingests a structure fire as kind=fire with priority-1 high severity", async () => {
    const fetch = mockResponse({
      incidents: [
        {
          incident_number: "F25001234",
          call_type: "Structure Fire",
          call_type_group: "Fire",
          received: "2026-05-18T10:14:22-07:00",
          priority: "1",
          address: "100 block of Market St",
          neighborhood: "Financial District",
          latitude: 37.7935,
          longitude: -122.3950,
          units: ["E1", "T1", "B2"],
          status: "active",
        },
      ],
    });
    const { rows, highWaterMark } = await fetchSFFDActive({ fetch });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: SFFD_ACTIVE_SOURCE,
      sourceUid: "F25001234",
      kind: "fire",
      title: "Structure Fire",
      severity: "high",
      priority: "1",
      status: "active",
      neighborhood: "Financial District",
    });
    expect(rows[0]?.subtitle).toContain("E1, T1, B2");
    expect(highWaterMark?.toISOString()).toBe("2026-05-18T17:14:22.000Z");
  });

  it("classifies medical calls as kind=ems with priority-3 low severity", async () => {
    const fetch = mockResponse({
      incidents: [
        {
          incident_number: "M25099",
          call_type: "Medical Incident",
          call_type_group: "Medical",
          received: "2026-05-18T10:14:22-07:00",
          priority: 3,
          address: "Main St",
          latitude: 37.7780,
          longitude: -122.4100,
        },
      ],
    });
    const { rows } = await fetchSFFDActive({ fetch });
    expect(rows[0]?.kind).toBe("ems");
    expect(rows[0]?.severity).toBe("low");
  });

  it("falls back to id when incident_number is missing", async () => {
    const fetch = mockResponse({
      incidents: [
        {
          id: 99012,
          call_type: "Alarm",
          received: "2026-05-18T10:14:22-07:00",
          latitude: 37.7780,
          longitude: -122.4100,
        },
      ],
    });
    const { rows } = await fetchSFFDActive({ fetch });
    expect(rows[0]?.sourceUid).toBe("99012");
    expect(rows[0]?.kind).toBe("fire");
  });

  it("drops incidents outside SF bbox", async () => {
    const fetch = mockResponse({
      incidents: [
        {
          incident_number: "OAK1",
          call_type: "Structure Fire",
          received: "2026-05-18T10:14:22-07:00",
          // Oakland coords
          latitude: 37.8044,
          longitude: -122.2712,
        },
      ],
    });
    const { rows } = await fetchSFFDActive({ fetch });
    expect(rows).toHaveLength(0);
  });

  it("drops rows missing geo or timestamp", async () => {
    const fetch = mockResponse({
      incidents: [
        { incident_number: "NO-GEO", call_type: "Fire" },
        {
          incident_number: "NO-TIME",
          call_type: "Fire",
          latitude: 37.78,
          longitude: -122.4,
        },
      ],
    });
    const { rows } = await fetchSFFDActive({ fetch });
    expect(rows).toHaveLength(0);
  });

  it("throws on upstream 5xx", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 503 })) as never;
    await expect(fetchSFFDActive({ fetch })).rejects.toThrow(/SFFD active/);
  });
});
