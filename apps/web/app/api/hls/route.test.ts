import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { GET } from "./route";

function req(target: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/hls?url=${encodeURIComponent(target)}`,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BRIDGE_TUNNEL_URL;
  delete process.env.BRIDGE_TUNNEL_SECRET;
});

describe("GET /api/hls bridge proxy", () => {
  it("rejects bridge paths with encoded traversal segments", async () => {
    process.env.BRIDGE_TUNNEL_URL = "https://tunnel.example";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(req("bridge://bridge-1/%2e%2e/admin"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_bridge_url" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encodes safe bridge path segments before calling the tunnel", async () => {
    process.env.BRIDGE_TUNNEL_URL = "https://tunnel.example/base";
    process.env.BRIDGE_TUNNEL_SECRET = "secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(req("bridge://bridge-1/cam 1/live?quality=low"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://tunnel.example/relay/bridge-1/cam%201/live?quality=low",
      expect.objectContaining({
        headers: {
          accept: "*/*",
          "x-bridge-auth": "secret",
        },
        cache: "no-store",
      }),
    );
  });
});
