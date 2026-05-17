import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/contribute/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Loose insert shape — adminClient() is typed with Database = any, so
// supabase-js narrows mutation row types to `never` without this cast.
type LooseInsertResult = {
  data: { id: string } | null;
  error: { message: string; code?: string } | null;
};
type LooseTableMutation = {
  select: (cols: string) => { single: () => Promise<LooseInsertResult> };
};
type LooseTable = {
  insert: (row: Record<string, unknown>) => LooseTableMutation;
};
type LooseAdminClient = { from: (table: string) => LooseTable };

// All non-email fields are optional and accept empty strings — the
// client form always sends every field, even blank ones. emptyToNull()
// below collapses blanks to NULL on insert.
const schema = z.object({
  email: z.string().email().max(320),
  businessName: z.string().max(200).optional().default(""),
  address: z.string().max(300).optional().default(""),
  contactName: z.string().max(200).optional().default(""),
  cameraType: z.string().max(120).optional().default(""),
  message: z.string().max(2000).optional().default(""),
});

function emptyToNull(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`waitlist:${ip}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
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

  const supabase = adminClient() as unknown as LooseAdminClient;
  const { error } = await supabase
    .from("contributor_waitlist")
    .insert({
      email: body.email.trim().toLowerCase(),
      business_name: emptyToNull(body.businessName),
      address: emptyToNull(body.address),
      contact_name: emptyToNull(body.contactName),
      camera_type: emptyToNull(body.cameraType),
      message: emptyToNull(body.message),
      source_ip: ip,
      user_agent: request.headers.get("user-agent") ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique violation on lower(email) — surface a friendly 409
    // so the form can show "already on the list" rather than a 500.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
