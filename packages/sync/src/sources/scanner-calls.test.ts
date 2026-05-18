import { describe, it, expect, vi } from "vitest";
import {
  fetchScannerCalls,
  SCANNER_CALLS_SOURCE,
} from "./scanner-calls";

function mockResponse(body: unknown, status = 200): typeof globalThis.fetch {
  return vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status })) as never;
}

describe("fetchScannerCalls", () => {
  it("ingests scanner calls with no geo", async () => {
    const fetch = mockResponse({
      calls: [
        {
          _id: "65f1a2b3c4d5e6f7",
          time: "2026-05-18T03:14:22.000Z",
          len: 7,
          talkgroupNum: 10000,
          talkgroupTag: "Citywide-1",
          talkgroupGroup: "SFPD Operations",
          talkgroupDescription: "Citywide tac 1",
          url: "/audio.m4a",
        },
      ],
    });
    const { rows, highWaterMark } = await fetchScannerCalls({ fetch });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: SCANNER_CALLS_SOURCE,
      sourceUid: "65f1a2b3c4d5e6f7",
      kind: "scanner",
      title: "Citywide-1",
      severity: "high",
      priority: "10000",
      lat: null,
      lng: null,
      geoPrecision: "unknown",
    });
    expect(rows[0]?.subtitle).toContain("7s");
    expect(highWaterMark?.toISOString()).toBe("2026-05-18T03:14:22.000Z");
  });

  it("classifies routine talkgroups as low severity", async () => {
    const fetch = mockResponse({
      calls: [
        {
          _id: "a1",
          time: "2026-05-18T03:14:22.000Z",
          talkgroupTag: "Admin",
        },
      ],
    });
    const { rows } = await fetchScannerCalls({ fetch });
    expect(rows[0]?.severity).toBe("low");
  });

  it("classifies dispatch talkgroups as medium severity", async () => {
    const fetch = mockResponse({
      calls: [
        {
          _id: "a2",
          time: "2026-05-18T03:14:22.000Z",
          talkgroupTag: "Dispatch Tac",
        },
      ],
    });
    const { rows } = await fetchScannerCalls({ fetch });
    expect(rows[0]?.severity).toBe("med");
  });

  it("passes since= as unix-ms `time` query param", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ calls: [] }), { status: 200 }),
      ) as never;
    await fetchScannerCalls(
      { fetch },
      { since: "2026-05-18T03:00:00.000Z" },
    );
    const called = (fetch as unknown as { mock: { calls: [string][] } })
      .mock.calls[0]![0]!;
    const expected = new Date("2026-05-18T03:00:00.000Z").getTime();
    expect(called).toContain(`time=${expected}`);
  });

  it("omits the time param on cold start", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ calls: [] }), { status: 200 }),
      ) as never;
    await fetchScannerCalls({ fetch });
    const called = (fetch as unknown as { mock: { calls: [string][] } })
      .mock.calls[0]![0]!;
    expect(called).not.toContain("time=");
  });

  it("drops calls with no _id or no timestamp", async () => {
    const fetch = mockResponse({
      calls: [
        { time: "2026-05-18T03:14:22.000Z", talkgroupTag: "x" },
        { _id: "no-time", talkgroupTag: "x" },
      ],
    });
    const { rows } = await fetchScannerCalls({ fetch });
    expect(rows).toHaveLength(0);
  });

  it("respects the limit option", async () => {
    const fetch = mockResponse({
      calls: Array.from({ length: 10 }, (_, i) => ({
        _id: `id-${i}`,
        time: "2026-05-18T03:14:22.000Z",
        talkgroupTag: "Admin",
      })),
    });
    const { rows } = await fetchScannerCalls({ fetch }, { limit: 3 });
    expect(rows).toHaveLength(3);
  });

  it("throws on upstream 5xx", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 502 })) as never;
    await expect(fetchScannerCalls({ fetch })).rejects.toThrow(/OpenMHz/);
  });
});
