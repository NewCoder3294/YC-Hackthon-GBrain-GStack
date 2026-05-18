// Contract tests for the request_camera_access RPC. Runs against the live
// Supabase project — the same one the dev app talks to. Tests are fully
// self-contained (seed + teardown). Skipped if service-role creds are missing.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load apps/web/.env.local so the suite is runnable without manual exports.
try {
  const envPath = resolve(__dirname, "..", ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      const key = m[1]!;
      const value = (m[2] ?? "").replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {
  // No .env.local — fall back to whatever the shell has.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);

const supabase = enabled
  ? createClient(url!, key!, { auth: { persistSession: false } })
  : null;

interface RpcResult {
  event_id: string;
  allowed: boolean;
  denial_reason: string | null;
  policy_snapshot: Record<string, unknown> | null;
}

const suffix = `rpc-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

let publicCameraId = "";
let contributorCameraId = "";
let contributorId = "";
let incidentId = "";

describe.skipIf(!enabled)("request_camera_access RPC", () => {
  beforeAll(async () => {
    const s = supabase!;

    const { data: c, error: ce } = await s
      .from("contributors")
      .insert({
        name: `RPC Test ${suffix}`,
        contact_phone: `+1555${Math.floor(Math.random() * 10_000_000)
          .toString()
          .padStart(7, "0")}`,
        token: `t-${suffix}`,
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (ce) throw ce;
    contributorId = c!.id;

    const { data: pub, error: pe } = await s
      .from("cameras")
      .insert({
        caltrans_id: `pub-${suffix}`,
        district: 4,
        route: "I-test",
        description: "RPC public test",
        lat: 37.77,
        lng: -122.42,
        stream_url: "test://public",
        stream_type: "hls",
      })
      .select("id")
      .single();
    if (pe) throw pe;
    publicCameraId = pub!.id;

    const { data: priv, error: priE } = await s
      .from("cameras")
      .insert({
        caltrans_id: `priv-${suffix}`,
        district: 4,
        route: "I-test",
        description: "RPC private test",
        lat: 37.77,
        lng: -122.42,
        stream_url: "test://priv",
        stream_type: "hls",
        contributor_id: contributorId,
      })
      .select("id")
      .single();
    if (priE) throw priE;
    contributorCameraId = priv!.id;

    const { data: inc, error: ie } = await s
      .from("incidents")
      .insert({
        title: `RPC test fight detection ${suffix}`,
        severity: "med",
        created_by: "00000000-0000-0000-0000-000000000000",
      })
      .select("id")
      .single();
    if (ie) throw ie;
    incidentId = inc!.id;
  });

  afterAll(async () => {
    if (!enabled) return;
    const s = supabase!;
    await s
      .from("camera_access_events")
      .delete()
      .in("camera_id", [publicCameraId, contributorCameraId]);
    await s.from("camera_policies").delete().eq("camera_id", contributorCameraId);
    await s.from("incidents").delete().eq("id", incidentId);
    await s.from("cameras").delete().in("id", [publicCameraId, contributorCameraId]);
    await s.from("contributors").delete().eq("id", contributorId);
  });

  async function call(args: Record<string, unknown>): Promise<RpcResult> {
    const { data, error } = await supabase!.rpc("request_camera_access", args);
    if (error) throw new Error(error.message);
    const row = (data as RpcResult[] | null)?.[0];
    if (!row) throw new Error("RPC returned no rows");
    return row;
  }

  it("public camera → allowed, public_domain", async () => {
    const res = await call({
      p_camera_id: publicCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:public",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(true);
    expect(res.denial_reason).toBeNull();
    expect(res.policy_snapshot).toBeNull();

    const { data: ev } = await supabase!
      .from("camera_access_events")
      .select("legal_basis")
      .eq("id", res.event_id)
      .single();
    expect(ev!.legal_basis).toBe("public_domain");
  });

  it("contributor camera with no policy row → allowed, basis preserved", async () => {
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:nopolicy",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(true);
    expect(res.denial_reason).toBeNull();
    expect(res.policy_snapshot).toBeNull();
  });

  it("warrant_required without warrant or exigent → denied", async () => {
    await supabase!.from("camera_policies").upsert({
      camera_id: contributorCameraId,
      geofence_radius_m: 200,
      warrant_required: true,
      exigent_allowed: true,
      blocked_incident_types: [],
    });
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:warrant",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(false);
    expect(res.denial_reason).toBe("warrant_required");
    expect(res.policy_snapshot).not.toBeNull();
  });

  it("warrant_required with exigent_allowed + is_exigent → allowed", async () => {
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:exigent",
      p_legal_basis: "exigent",
      p_reason: "unit test",
      p_is_exigent: true,
    });
    expect(res.allowed).toBe(true);
    expect(res.denial_reason).toBeNull();
  });

  it("blocked_incident_types keyword match → denied", async () => {
    await supabase!.from("camera_policies").upsert({
      camera_id: contributorCameraId,
      geofence_radius_m: 200,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: ["fight detection"],
    });
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:blocked",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(false);
    expect(res.denial_reason).toBe("blocked_incident_type");
  });

  it("outside time window → denied", async () => {
    // Pick a one-minute window that does NOT include the current LA local time.
    const nowLocal = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
    );
    const future = new Date(nowLocal.getTime() + 60_000);
    const farFuture = new Date(nowLocal.getTime() + 120_000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const start = `${pad(future.getHours())}:${pad(future.getMinutes())}`;
    const end = `${pad(farFuture.getHours())}:${pad(farFuture.getMinutes())}`;

    await supabase!.from("camera_policies").upsert({
      camera_id: contributorCameraId,
      geofence_radius_m: 200,
      window_start_local: start,
      window_end_local: end,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: [],
    });
    const res = await call({
      p_camera_id: contributorCameraId,
      p_incident_id: incidentId,
      p_accessed_by: "test:window",
      p_legal_basis: "standing_consent",
      p_reason: "unit test",
    });
    expect(res.allowed).toBe(false);
    expect(res.denial_reason).toBe("outside_time_window");

    await supabase!.from("camera_policies").upsert({
      camera_id: contributorCameraId,
      geofence_radius_m: 200,
      window_start_local: null,
      window_end_local: null,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: [],
    });
  });
});
