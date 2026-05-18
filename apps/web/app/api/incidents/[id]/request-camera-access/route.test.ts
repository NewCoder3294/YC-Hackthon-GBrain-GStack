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
    getUser.mockReset();
    adminRpc.mockReset();
  });

  it("401 when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      makeReq({}) as never,
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(res.status).toBe(401);
  });

  it("400 when body invalid", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "d@x", id: "u1" } } });
    const res = await POST(
      makeReq({ cameraId: "not-a-uuid" }) as never,
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(res.status).toBe(400);
  });

  it("forwards to RPC with dispatcher: prefix and returns its result", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "d@x", id: "u1" } } });
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
        legalBasis: "standing_consent",
        reason: "test",
      }) as never,
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowed).toBe(true);
    expect(adminRpc).toHaveBeenCalledWith(
      "request_camera_access",
      expect.objectContaining({
        p_camera_id: "11111111-1111-1111-1111-111111111111",
        p_incident_id: "00000000-0000-0000-0000-000000000000",
        p_accessed_by: "dispatcher:d@x",
        p_legal_basis: "standing_consent",
      }),
    );
  });
});
