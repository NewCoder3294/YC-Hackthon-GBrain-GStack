import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const adminRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
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
    getUser.mockReset();
    adminRpc.mockReset();
  });

  it("401 when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      makeReq({}) as never,
      {
        params: Promise.resolve({
          id: "11111111-1111-1111-1111-111111111111",
        }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("calls RPC with null incident", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "d@x", id: "u1" } } });
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
