import { describe, it, expect, vi } from "vitest";
import { fetchPGEOutages, PGE_OUTAGES_SOURCE } from "./pge-outages";

function mockResponse(body: unknown, status = 200): typeof globalThis.fetch {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), { status }),
    ) as never;
}

describe("fetchPGEOutages", () => {
  it("ingests an SF outage with exact geo + customers-driven severity", async () => {
    const fetch = mockResponse({
      outagesList: [
        {
          outageId: "BMN-9001",
          outageStartTime: "2026-05-18T03:14:22-07:00",
          estimatedRestoreTime: "2026-05-18T09:30:00-07:00",
          cause: "Equipment failure",
          status: "Crew assigned",
          impactedCustomers: 250,
          latitude: 37.7812,
          longitude: -122.4123,
          city: "San Francisco",
        },
      ],
    });
    const { rows, highWaterMark } = await fetchPGEOutages({ fetch });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: PGE_OUTAGES_SOURCE,
      sourceUid: "BMN-9001",
      kind: "outage",
      title: "Equipment failure",
      severity: "med",
      priority: "250",
      status: "Crew assigned",
      geoPrecision: "exact",
      address: "San Francisco",
    });
    expect(rows[0]?.subtitle).toContain("250 customers affected");
    expect(highWaterMark?.toISOString()).toBe("2026-05-18T10:14:22.000Z");
  });

  it("scales severity above 1k customers to high", async () => {
    const fetch = mockResponse({
      outagesList: [
        {
          outageId: "BMN-9002",
          outageStartTime: "2026-05-18T03:14:22-07:00",
          impactedCustomers: 5000,
          latitude: 37.7812,
          longitude: -122.4123,
        },
      ],
    });
    const { rows } = await fetchPGEOutages({ fetch });
    expect(rows[0]?.severity).toBe("high");
  });

  it("drops outages outside the SF bounding box", async () => {
    const fetch = mockResponse({
      outagesList: [
        {
          outageId: "BMN-OAK",
          outageStartTime: "2026-05-18T03:14:22-07:00",
          impactedCustomers: 100,
          // Oakland coords — outside SF bbox
          latitude: 37.8044,
          longitude: -122.2712,
        },
      ],
    });
    const { rows } = await fetchPGEOutages({ fetch });
    expect(rows).toHaveLength(0);
  });

  it("drops rows missing lat/lng", async () => {
    const fetch = mockResponse({
      outagesList: [
        {
          outageId: "BMN-NO-GEO",
          outageStartTime: "2026-05-18T03:14:22-07:00",
          impactedCustomers: 50,
        },
      ],
    });
    const { rows } = await fetchPGEOutages({ fetch });
    expect(rows).toHaveLength(0);
  });

  it("throws on non-2xx upstream", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("oops", { status: 500 })) as never;
    await expect(fetchPGEOutages({ fetch })).rejects.toThrow(/PG&E/);
  });

  it("handles empty outagesList", async () => {
    const fetch = mockResponse({ outagesList: [] });
    const { rows, highWaterMark } = await fetchPGEOutages({ fetch });
    expect(rows).toHaveLength(0);
    expect(highWaterMark).toBeNull();
  });
});
