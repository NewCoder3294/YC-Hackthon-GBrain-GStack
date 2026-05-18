import { describe, it, expect, vi, beforeEach } from "vitest";

const { syncNewsIncidents, isAuthorizedCron, createDb } = vi.hoisted(() => ({
  syncNewsIncidents: vi.fn(),
  isAuthorizedCron: vi.fn(),
  createDb: vi.fn(() => ({})),
}));

vi.mock("@caltrans/sync", () => ({ syncNewsIncidents }));
vi.mock("@caltrans/db", () => ({ createDb }));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCron }));
vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgres://test", CRON_SECRET: "test-secret-1234" },
}));

import { GET } from "./route";

function makeReq() {
  return new Request("http://x/api/cron/sync-news", {
    method: "GET",
    headers: { authorization: "Bearer test-secret-1234" },
  });
}

describe("GET /api/cron/sync-news", () => {
  beforeEach(() => {
    syncNewsIncidents.mockReset();
    isAuthorizedCron.mockReset();
    createDb.mockClear();
  });

  it("returns 401 when not authorized", async () => {
    isAuthorizedCron.mockReturnValue(false);
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
    expect(syncNewsIncidents).not.toHaveBeenCalled();
  });

  it("returns 200 with sync result on success", async () => {
    isAuthorizedCron.mockReturnValue(true);
    syncNewsIncidents.mockResolvedValue({
      ok: true,
      status: "ok",
      ranAt: "2026-05-18T12:00:00.000Z",
      upserted: 3,
      highWaterMark: null,
      durationMs: 12,
    });
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upserted).toBe(3);
    expect(syncNewsIncidents).toHaveBeenCalledWith(
      expect.objectContaining({ force: false }),
    );
  });

  it("returns 207 when sync reports !ok", async () => {
    isAuthorizedCron.mockReturnValue(true);
    syncNewsIncidents.mockResolvedValue({
      ok: false,
      status: "error",
      ranAt: "2026-05-18T12:00:00.000Z",
      upserted: 0,
      error: "boom",
      durationMs: 5,
    });
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(207);
  });

  it("passes force=true when ?force=1", async () => {
    isAuthorizedCron.mockReturnValue(true);
    syncNewsIncidents.mockResolvedValue({
      ok: true,
      status: "ok",
      ranAt: "now",
      upserted: 0,
      durationMs: 1,
    });
    const req = new Request("http://x/api/cron/sync-news?force=1", {
      method: "GET",
      headers: { authorization: "Bearer test-secret-1234" },
    });
    await GET(req as never);
    expect(syncNewsIncidents).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  it("returns 500 when orchestrator throws", async () => {
    isAuthorizedCron.mockReturnValue(true);
    syncNewsIncidents.mockRejectedValue(new Error("upstream dead"));
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("upstream dead");
  });
});
