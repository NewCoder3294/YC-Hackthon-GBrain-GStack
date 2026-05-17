import { describe, it, expect, vi } from "vitest";
import { syncLiveIncidents, SOURCE_CONFIGS } from "./orchestrate";
import type { Db } from "@caltrans/db";

// Mock all source fetchers so this test runs hermetically.
vi.mock("./sources/sfpd-cad", () => ({
  fetchSFPDCad: vi.fn().mockResolvedValue({ rows: [], highWaterMark: null }),
  SFPD_CAD_SOURCE: "sfpd_cad",
}));
vi.mock("./sources/fire-ems", () => ({
  fetchFireEMS: vi.fn().mockResolvedValue({ rows: [], highWaterMark: null }),
  FIRE_EMS_SOURCE: "sf_fire_ems",
}));
vi.mock("./sources/sf311", () => ({
  fetchSF311: vi.fn().mockResolvedValue({ rows: [], highWaterMark: null }),
  SF_311_SOURCE: "sf_311",
}));
vi.mock("./sources/sfpd-reports", () => ({
  fetchSFPDReports: vi
    .fn()
    .mockResolvedValue({ rows: [], highWaterMark: null }),
  SFPD_REPORTS_SOURCE: "sfpd_reports",
}));
vi.mock("./sources/traffic-511", () => ({
  fetchTraffic511: vi
    .fn()
    .mockResolvedValue({ rows: [], highWaterMark: null }),
  TRAFFIC_511_SOURCE: "511_traffic",
}));
vi.mock("./sources/transit-511", () => ({
  fetchTransit511: vi
    .fn()
    .mockResolvedValue({ rows: [], highWaterMark: null }),
  TRANSIT_511_SOURCE: "511_transit",
}));

// Tiny db that records mutations and lets us seed prior sync state.
function buildMockDb(priorSyncs: Record<string, { lastRunAt: Date; lastHighWaterMark: Date | null }> = {}) {
  const syncRows = { ...priorSyncs };
  const upserted: unknown[] = [];

  const mockDb = {
    select: () => ({
      from: () => ({
        where: (cond: { source?: string }) => ({
          limit: () => {
            // The eq() condition is what we need to match — we cheat and
            // pull source from the most recent select() context via a
            // closure trick: we let runSource pass the source via the
            // condition. Easier: assume tests inspect using known sources.
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: (table: { _: { name?: string } } | unknown) => ({
      values: (vals: unknown) => ({
        onConflictDoUpdate: (_args: unknown) => {
          upserted.push({ table, vals });
          return Promise.resolve();
        },
      }),
    }),
  };
  return { db: mockDb as unknown as Db, syncRows, upserted };
}

describe("syncLiveIncidents orchestration", () => {
  it("runs all sources and reports per-source results", async () => {
    const { db } = buildMockDb();
    const result = await syncLiveIncidents({
      db,
      fetch: globalThis.fetch,
      sf511ApiKey: "test-key",
      force: true,
    });
    expect(result.ok).toBe(true);
    expect(result.sources).toHaveLength(Object.keys(SOURCE_CONFIGS).length);
    for (const r of result.sources) {
      expect(r.status).toBe("ok");
    }
  });

  it("returns error status when a source throws", async () => {
    const cad = await import("./sources/sfpd-cad");
    (cad.fetchSFPDCad as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error("upstream 503"));
    const { db } = buildMockDb();
    const result = await syncLiveIncidents({
      db,
      fetch: globalThis.fetch,
      sf511ApiKey: "test-key",
      force: true,
      sources: ["sfpd_cad"],
    });
    expect(result.ok).toBe(false);
    expect(result.sources[0]?.status).toBe("error");
    expect(result.sources[0]?.error).toContain("upstream 503");
  });

  it("errors out 511 sources without an API key", async () => {
    const { db } = buildMockDb();
    const result = await syncLiveIncidents({
      db,
      fetch: globalThis.fetch,
      sf511ApiKey: undefined,
      force: true,
      sources: ["511_traffic"],
    });
    expect(result.sources[0]?.status).toBe("error");
    expect(result.sources[0]?.error).toContain("SF_511_API_KEY");
  });
});
