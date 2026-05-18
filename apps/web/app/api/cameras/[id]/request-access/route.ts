import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  legalBasis: z.enum(["standing_consent", "exigent", "warrant"]),
  reason: z.string().min(1).max(500),
  hasWarrant: z.boolean().default(false),
  isExigent: z.boolean().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: cameraId } = await params;

  const supaUser = await createClient();
  const {
    data: { user },
  } = await supaUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const admin = adminClient();
  const { data, error } = await admin.rpc("request_camera_access", {
    p_camera_id: cameraId,
    p_incident_id: null,
    p_accessed_by: `dispatcher:${user.email ?? user.id}`,
    p_legal_basis: b.legalBasis,
    p_reason: b.reason,
    p_has_warrant: b.hasWarrant,
    p_is_exigent: b.isExigent,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : null;
  return NextResponse.json(row);
}
