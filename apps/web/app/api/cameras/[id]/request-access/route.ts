import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { requireDispatcher } from "@/lib/auth/require-dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  legalBasis: z.enum(["standing_consent", "exigent", "warrant"]),
  reason: z.string().min(1).max(500),
});

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const raw = await params;
  const parsedParams = paramsSchema.safeParse(raw);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "invalid_camera_id" }, { status: 400 });
  }
  const cameraId = parsedParams.data.id;

  const user = await requireDispatcher();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const hasWarrant = b.legalBasis === "warrant";
  const isExigent = b.legalBasis === "exigent";

  const admin = adminClient();
  const { data, error } = await admin.rpc("request_camera_access", {
    p_camera_id: cameraId,
    p_incident_id: null,
    p_accessed_by: `dispatcher:${user.email ?? user.id}`,
    p_legal_basis: b.legalBasis,
    p_reason: b.reason,
    p_has_warrant: hasWarrant,
    p_is_exigent: isExigent,
  });

  if (error) {
    console.error("[cameras/request-access] rpc error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : null;
  return NextResponse.json(row);
}
