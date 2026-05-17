import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { codeIsValid } from "@/lib/contribute/code";
import { rateLimit } from "@/lib/contribute/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`verify:${ip}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { token, code } = parsed.data;

  const supabase = adminClient();

  const { data: contributor, error: fetchErr } = await supabase
    .from("contributors")
    .select("id, verification_code, verification_expires_at, verified_at, removed_at")
    .eq("token", token)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!contributor || contributor.removed_at) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (contributor.verified_at) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }
  if (!codeIsValid(code, contributor.verification_code, contributor.verification_expires_at)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("contributors")
    .update({
      verified_at: new Date().toISOString(),
      verification_code: null,
      verification_expires_at: null,
    })
    .eq("id", contributor.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await supabase
    .from("cameras")
    .update({ is_active: true })
    .eq("contributor_id", contributor.id);

  return NextResponse.json({ ok: true, alreadyVerified: false });
}
