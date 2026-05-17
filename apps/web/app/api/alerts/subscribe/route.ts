import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/contribute/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEVERITY = z.enum(["low", "med", "high"]);

const schema = z.object({
  email: z.string().email().max(320),
  neighborhoods: z.array(z.string().min(1).max(120)).max(40).default([]),
  minSeverity: SEVERITY.default("med"),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`alerts:${ip}`, { limit: 5, windowMs: 60_000 })) {
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
  const supabase = adminClient();
  const unsubscribeToken = randomBytes(18).toString("hex");

  const { error } = await supabase.from("alert_subscriptions").insert({
    email: body.email.trim().toLowerCase(),
    neighborhoods: body.neighborhoods,
    min_severity: body.minSeverity,
    unsubscribe_token: unsubscribeToken,
    confirmed: true, // Skip double-opt-in for v1 — single-click unsubscribe in every email.
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
