import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendAlertEmail } from "@/lib/alerts/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Subscription {
  id: string;
  email: string;
  neighborhoods: string[];
  min_severity: "low" | "med" | "high";
  unsubscribe_token: string;
  last_sent_at: string | null;
}

interface LiveRow {
  id: string;
  title: string;
  subtitle: string | null;
  severity: "low" | "med" | "high";
  neighborhood: string | null;
  address: string | null;
  occurred_at: string;
}

const SEV_ORDER: Record<"low" | "med" | "high", number> = { low: 0, med: 1, high: 2 };

// Cap how many emails go out per cron run — prevents a burst if the live
// feed lights up.
const PER_RUN_CAP = 50;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();

  // 1. Pull active subscriptions.
  const { data: subsRaw, error: subsErr } = await supabase
    .from("alert_subscriptions")
    .select("id, email, neighborhoods, min_severity, unsubscribe_token, last_sent_at")
    .eq("confirmed", true);
  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }
  const subs = (subsRaw ?? []) as Subscription[];
  if (subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_subscribers" });
  }

  // 2. Pull recent unacknowledged live incidents (last 30 min window — the
  // cron is on a 5-min cadence so 30 min covers any retry/backlog).
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: liveRaw, error: liveErr } = await supabase
    .from("live_incidents")
    .select("id, title, subtitle, severity, neighborhood, address, occurred_at")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (liveErr) {
    return NextResponse.json({ error: liveErr.message }, { status: 500 });
  }
  const live = (liveRaw ?? []) as LiveRow[];
  if (live.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_recent_incidents" });
  }

  // 3. Pull sends already made for this batch so we never double-email.
  const incidentIds = live.map((l) => l.id);
  const { data: sentRaw } = await supabase
    .from("alert_sends")
    .select("subscription_id, live_incident_id")
    .in("live_incident_id", incidentIds);
  const sentSet = new Set<string>();
  for (const s of (sentRaw ?? []) as { subscription_id: string; live_incident_id: string }[]) {
    sentSet.add(`${s.subscription_id}:${s.live_incident_id}`);
  }

  // 4. For each subscription, find matching incidents and send.
  let sentCount = 0;
  const errors: string[] = [];

  outer: for (const sub of subs) {
    const minSev = SEV_ORDER[sub.min_severity];
    for (const inc of live) {
      if (sentCount >= PER_RUN_CAP) break outer;
      if (SEV_ORDER[inc.severity] < minSev) continue;
      if (
        sub.neighborhoods.length > 0 &&
        (!inc.neighborhood || !sub.neighborhoods.includes(inc.neighborhood))
      ) {
        continue;
      }
      if (sentSet.has(`${sub.id}:${inc.id}`)) continue;

      const subject = `[${inc.severity.toUpperCase()}] ${inc.title}${
        inc.neighborhood ? ` · ${inc.neighborhood}` : ""
      }`;
      const body =
        `${inc.title}\n` +
        (inc.subtitle ? `${inc.subtitle}\n` : "") +
        (inc.address ? `Location: ${inc.address}\n` : "") +
        (inc.neighborhood ? `Neighborhood: ${inc.neighborhood}\n` : "") +
        `Occurred: ${inc.occurred_at}`;

      const r = await sendAlertEmail({
        to: sub.email,
        subject,
        body,
        unsubscribeToken: sub.unsubscribe_token,
      });

      // Log the send attempt regardless of outcome so retries are bounded.
      await supabase.from("alert_sends").insert({
        subscription_id: sub.id,
        live_incident_id: inc.id,
        channel: "email",
        status: r.ok ? "sent" : "failed",
        sent_at: r.ok ? new Date().toISOString() : null,
      });

      if (r.ok) {
        sentCount++;
        await supabase
          .from("alert_subscriptions")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", sub.id);
      } else {
        errors.push(`${sub.email}:${inc.id}:${r.error}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sentCount,
    subscribers: subs.length,
    incidents: live.length,
    errors: errors.slice(0, 5),
  });
}
