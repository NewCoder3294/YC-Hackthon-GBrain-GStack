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
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export async function POST(request: NextRequest) {
  const rate = await checkRateLimit(request, {
    ...RATE_LIMITS.sensitiveWrite,
    keyPrefix: "api:contribute-remove",
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { token } = parsed.data;

  const supabase = adminClient();
  const { data: contributor } = await supabase
    .from("contributors")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (!contributor) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await supabase.from("contributors").update({ removed_at: new Date().toISOString() }).eq("id", contributor.id);
  await supabase.from("cameras").update({ is_active: false }).eq("contributor_id", contributor.id);

  return NextResponse.json({ ok: true });
}
