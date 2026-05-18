import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireDispatcher, adminRpc } = vi.hoisted(() => ({
  requireDispatcher: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock("@/lib/auth/require-dispatcher", () => ({ requireDispatcher }));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ rpc: adminRpc }),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request(
    "http://x/api/incidents/00000000-0000-0000-0000-000000000000/request-camera-access",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/incidents/[id]/request-camera-access", () => {
  beforeEach(() => {
    requireDispatcher.mockReset();
    adminRpc.mockReset();
  });

  it("403 when not a dispatcher", async () => {
    requireDispatcher.mockResolvedValue(null);
    const res = await POST(
      makeReq({}) as never,
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(res.status).toBe(403);
  });

  it("400 when body invalid", async () => {
    requireDispatcher.mockResolvedValue({ id: "u1", email: "d@x" });
    const res = await POST(
      makeReq({ cameraId: "not-a-uuid" }) as never,
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(res.status).toBe(400);
  });

  it("forwards to RPC and derives privileged flags from legalBasis", async () => {
    requireDispatcher.mockResolvedValue({ id: "u1", email: "d@x" });
    adminRpc.mockResolvedValue({
      data: [
        {
          event_id: "e1",
          allowed: true,
          denial_reason: null,
          policy_snapshot: null,
        },
      ],
      error: null,
    });
    const res = await POST(
      makeReq({
        cameraId: "11111111-1111-1111-1111-111111111111",
        legalBasis: "warrant",
        reason: "warrant served at 2026-05-18 0830 PST",
      }) as never,
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(res.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith(
      "request_camera_access",
      expect.objectContaining({
        p_camera_id: "11111111-1111-1111-1111-111111111111",
        p_incident_id: "00000000-0000-0000-0000-000000000000",
        p_accessed_by: "dispatcher:d@x",
        p_legal_basis: "warrant",
        p_has_warrant: true,
        p_is_exigent: false,
      }),
    );
  });
});
