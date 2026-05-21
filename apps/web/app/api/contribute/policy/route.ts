import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import {
  RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  geofence_radius_m: z.number().int().min(50).max(5000),
  window_start_local: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  window_end_local: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  warrant_required: z.boolean(),
  exigent_allowed: z.boolean(),
  blocked_incident_types: z.array(z.string().min(1).max(40)).max(40),
});

export async function POST(request: NextRequest) {
  const rate = await checkRateLimit(request, {
    ...RATE_LIMITS.sensitiveWrite,
    keyPrefix: "api:contribute-policy",
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  const token = request.nextUrl.searchParams.get("token");
  const cameraId = request.nextUrl.searchParams.get("cameraId");
  if (!token || !cameraId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const supabase = adminClient();

  // Verify the camera belongs to the contributor identified by token.
  const { data: contributor } = await supabase
    .from("contributors")
    .select("id, removed_at")
    .eq("token", token)
    .maybeSingle();
  if (!contributor || contributor.removed_at) {
    return NextResponse.json({ error: "invalid_token" }, { status: 403 });
  }

  const { data: camera } = await supabase
    .from("cameras")
    .select("id, contributor_id")
    .eq("id", cameraId)
    .maybeSingle();
  if (!camera || camera.contributor_id !== contributor.id) {
    return NextResponse.json({ error: "camera_not_owned" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const { error } = await supabase
    .from("camera_policies")
    .upsert(
      {
        camera_id: cameraId,
        ...body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "camera_id" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log entry — the policy edit is itself a recordable event per PRD §5.2.
  await supabase.from("camera_access_events").insert({
    camera_id: cameraId,
    contributor_id: contributor.id,
    accessed_by: `contributor:${contributor.id}`,
    legal_basis: "standing_consent",
    reason: "policy update",
  });

  return NextResponse.json({ ok: true });
}
