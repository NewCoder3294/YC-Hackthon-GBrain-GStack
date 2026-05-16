import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/contribute/sms";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();
  const { data: queued, error } = await supabase
    .from("contributor_notifications")
    .select("id, body, contributor_id, contributors(contact_phone)")
    .eq("status", "queued")
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!queued || queued.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0 });
  }

  let sent = 0;
  let failed = 0;
  for (const row of queued) {
    const contributors = row.contributors as unknown as
      | { contact_phone: string | null }
      | { contact_phone: string | null }[]
      | null;
    const contributor = Array.isArray(contributors) ? contributors[0] : contributors;
    const phone = contributor?.contact_phone;
    if (!phone) {
      await supabase
        .from("contributor_notifications")
        .update({ status: "failed", error: "missing_phone" })
        .eq("id", row.id);
      failed++;
      continue;
    }
    const result = await sendSms({ to: phone, body: row.body });
    await supabase
      .from("contributor_notifications")
      .update({
        status: result.status,
        channel: result.channel,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
        error: result.error ?? null,
      })
      .eq("id", row.id);
    if (result.status === "sent") sent++;
    else failed++;
  }
  return NextResponse.json({ sent, failed });
}
