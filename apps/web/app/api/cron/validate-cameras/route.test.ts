import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Test the validate-cameras cron route.
 *
 * The route fans out to several supabase chains:
 *   1. select active surfaces (terminates on .limit())
 *   2. upsert surface health
 *   3. update affected cameras
 *   4. final surface staleness update (terminates on .lt("last_checked_at", ...))
 *
 * We use a flexible chain proxy that returns the correct terminal payload
 * based on which method ends the chain.
 */

const validateCameraMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cameras/validate", () => ({
  validateCamera: validateCameraMock,
}));

const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

interface ChainConfig {
  // queued payloads keyed by chain kind, in FIFO order
  selectRows?: Array<unknown>;
  staleCounts?: Array<number>;
}

function buildAdminClient(cfg: ChainConfig) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  function makeChain(): Record<string, unknown> {
    const proxy: Record<string, unknown> = {};
    const passthrough = [
      "select",
      "eq",
      "order",
      "in",
      "gte",
      "lte",
      "or",
      "neq",
    ];
    for (const m of passthrough) {
      proxy[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args });
        return proxy;
      });
    }
    // .update() returns a chain that itself may terminate via .eq() or .lt()
    proxy.update = vi.fn((...args: unknown[]) => {
      calls.push({ method: "update", args });
      return proxy;
    });
    proxy.upsert = vi.fn((...args: unknown[]) => {
      calls.push({ method: "upsert", args });
      return Promise.resolve({ data: null, error: null });
    });
    // Terminal: .limit() resolves to a select payload
    proxy.limit = vi.fn((...args: unknown[]) => {
      calls.push({ method: "limit", args });
      const next = cfg.selectRows?.shift() ?? null;
      return Promise.resolve({ data: next, error: null });
    });
    // Terminal: .lt() resolves to the staleness count update
    proxy.lt = vi.fn((...args: unknown[]) => {
      calls.push({ method: "lt", args });
      const c = cfg.staleCounts?.shift() ?? 0;
      return Promise.resolve({ count: c, error: null });
    });
    // .eq() can be either passthrough (mid-chain) or terminal (last update).
    // We model it as passthrough by default; the per-row update awaits the
    // chain and a passthrough returning `proxy` resolves to `proxy` (which
    // is fine — the route doesn't read .data from per-row updates).
    proxy.then = (
      resolve: (v: { data: unknown; error: unknown }) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(resolve);
    return proxy;
  }

  const from = vi.fn(() => makeChain());
  return {
    client: { from },
    fromMock: from,
    calls,
  };
}

const adminFactoryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: adminFactoryMock,
}));

import { GET, POST } from "./route";

function makeReq(auth?: string, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/cron/validate-cameras", {
    method,
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  validateCameraMock.mockReset();
  revalidateTagMock.mockReset();
  adminFactoryMock.mockReset();
  process.env.WATCHDOG_CRON_SECRET = "test-cron-secret-xxxxxxxxxxxxxxx";
});

describe("POST /api/cron/validate-cameras", () => {
  it("401s without bearer", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("401s with wrong bearer", async () => {
    const res = await POST(makeReq("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("validates each surface and returns counters", async () => {
    const { client, calls } = buildAdminClient({
      selectRows: [
        [
          {
            id: "surface-1",
            camera_id: "cam-1",
            kind: "hls",
            url: "https://x/x.m3u8",
            priority: 20,
            cameras: { id: "cam-1", source: "curated" },
          },
          {
            id: "surface-2",
            camera_id: "cam-2",
            kind: "still",
            url: "https://y/y.jpg",
            priority: 10,
            cameras: { id: "cam-2", source: "curated" },
          },
        ],
      ],
      staleCounts: [3],
    });
    adminFactoryMock.mockReturnValue(client);
    validateCameraMock
      .mockResolvedValueOnce({ status: "ok", error: null })
      .mockResolvedValueOnce({ status: "failed", error: "http_404" });

    const res = await POST(
      makeReq("Bearer test-cron-secret-xxxxxxxxxxxxxxx"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(2);
    expect(json.ok).toBe(1);
    expect(json.degraded).toBe(0);
    expect(json.failed).toBe(1);
    expect(json.staled).toBe(3);
    expect(validateCameraMock).toHaveBeenCalledTimes(2);
    expect(validateCameraMock).toHaveBeenCalledWith(
      {
        streamUrl: "https://x/x.m3u8",
        streamType: "hls",
        source: "curated",
        stillImageUrl: null,
        hlsUrl: "https://x/x.m3u8",
      },
      expect.any(Function),
    );
    const healthUpsert = calls.find((c) => c.method === "upsert");
    expect(healthUpsert).toBeDefined();
    expect(revalidateTagMock).toHaveBeenCalledWith("cameras");
  });

  it("supports GET for Vercel Cron", async () => {
    const { client } = buildAdminClient({
      selectRows: [[]],
      staleCounts: [0],
    });
    adminFactoryMock.mockReturnValue(client);

    const res = await GET(
      makeReq("Bearer test-cron-secret-xxxxxxxxxxxxxxx", "GET"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: 0, staled: 0 });
  });

  it("runs the staleness sweep and reports count=0 when nothing stale", async () => {
    const { client, calls } = buildAdminClient({
      selectRows: [[]],
      staleCounts: [0],
    });
    adminFactoryMock.mockReturnValue(client);

    const res = await POST(
      makeReq("Bearer test-cron-secret-xxxxxxxxxxxxxxx"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(json.staled).toBe(0);
    expect(revalidateTagMock).not.toHaveBeenCalled();
    // The staleness sweep should have updated stale surface health.
    const staleUpdate = calls.find(
      (c) =>
        c.method === "update" &&
        typeof c.args[0] === "object" &&
        (c.args[0] as { reachability_status?: string }).reachability_status ===
          "stale" &&
        (c.args[0] as { visual_status?: string }).visual_status === "stale",
    );
    expect(staleUpdate).toBeDefined();
    // And called .lt("last_checked_at", ...) terminal
    const ltCall = calls.find(
      (c) => c.method === "lt" && c.args[0] === "last_checked_at",
    );
    expect(ltCall).toBeDefined();
  });
});
