import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(request, {
    ...RATE_LIMITS.sensitiveWrite,
    keyPrefix: "api:alerts-unsubscribe",
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  const token = request.nextUrl.searchParams.get("t");
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  const supabase = adminClient();
  const { error, data } = await supabase
    .from("alert_subscriptions")
    .delete()
    .eq("unsubscribe_token", token)
    .select("email")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return new NextResponse(
      "<html><body style=\"font-family:system-ui;padding:40px;max-width:560px;margin:auto\"><h1>Already unsubscribed</h1><p>This link is no longer valid. You're not on the WatchDog alert list.</p></body></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    );
  }
  return new NextResponse(
    `<html><body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto"><h1>Unsubscribed</h1><p>${data.email} has been removed from WatchDog alerts. Sorry to see you go.</p></body></html>`,
    { status: 200, headers: { "content-type": "text/html" } },
  );
}
