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
    "http://x/api/cameras/11111111-1111-1111-1111-111111111111/request-access",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/cameras/[id]/request-access", () => {
  beforeEach(() => {
    requireDispatcher.mockReset();
    adminRpc.mockReset();
  });

  it("403 when not a dispatcher", async () => {
    requireDispatcher.mockResolvedValue(null);
    const res = await POST(
      makeReq({}) as never,
      {
        params: Promise.resolve({
          id: "11111111-1111-1111-1111-111111111111",
        }),
      },
    );
    expect(res.status).toBe(403);
  });

  it("calls RPC with null incident", async () => {
    requireDispatcher.mockResolvedValue({ id: "u1", email: "d@x" });
    adminRpc.mockResolvedValue({
      data: [
        {
          event_id: "e1",
          allowed: false,
          denial_reason: "warrant_required",
          policy_snapshot: {},
        },
      ],
      error: null,
    });
    const res = await POST(
      makeReq({ legalBasis: "standing_consent", reason: "ad-hoc" }) as never,
      {
        params: Promise.resolve({
          id: "11111111-1111-1111-1111-111111111111",
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith(
      "request_camera_access",
      expect.objectContaining({
        p_camera_id: "11111111-1111-1111-1111-111111111111",
        p_incident_id: null,
      }),
    );
  });
});
