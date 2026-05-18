import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/contribute/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two ways to revoke a bridge:
//   - device_token (bearer header) — the app self-deregisters on uninstall
//   - bridge_id + contributor token (JSON body) — contributor unpairs an old
//     phone from the dashboard when they no longer have access to it
const bodySchema = z.object({
  bridge_id: z.string().uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`bridge_disconnect:${ip}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const sb = adminClient();

  // Path A: app-initiated unpair via device_token
  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const deviceToken = auth.slice(7);
    const { data: bridge } = await sb
      .from("bridges")
      .select("id, contributor_id")
      .eq("device_token", deviceToken)
      .is("removed_at", null)
      .maybeSingle();
    if (!bridge) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    await sb
      .from("bridges")
      .update({
        removed_at: new Date().toISOString(),
        device_token: null,
      })
      .eq("id", bridge.id);
    await sb
      .from("cameras")
      .update({ is_active: false })
      .eq("bridge_id", bridge.id);
    return NextResponse.json({ ok: true, bridge_id: bridge.id });
  }

  // Path B: contributor-initiated unpair via dashboard
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data: contributor } = await sb
    .from("contributors")
    .select("id")
    .eq("token", parsed.data.token)
    .is("removed_at", null)
    .maybeSingle();
  if (!contributor) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: bridge } = await sb
    .from("bridges")
    .select("id, contributor_id")
    .eq("id", parsed.data.bridge_id)
    .is("removed_at", null)
    .maybeSingle();
  // Ownership check — contributor can only unpair their own bridges. Return
  // 404 either way so an attacker can't probe bridge_ids.
  if (!bridge || bridge.contributor_id !== contributor.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await sb
    .from("bridges")
    .update({
      removed_at: new Date().toISOString(),
      device_token: null,
    })
    .eq("id", bridge.id);
  await sb
    .from("cameras")
    .update({ is_active: false })
    .eq("bridge_id", bridge.id);

  return NextResponse.json({ ok: true, bridge_id: bridge.id });
}
