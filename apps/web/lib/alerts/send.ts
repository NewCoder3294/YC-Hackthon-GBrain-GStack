import "server-only";
import { env } from "@/lib/env";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://watchdog-yc.vercel.app";

/**
 * Send an email via Resend if RESEND_API_KEY is set, otherwise log to console
 * (parity with the SMS sender's log fallback). Email content is plain text —
 * keep it short, one incident per message, with the unsubscribe link in the
 * footer (CAN-SPAM + UX).
 */
export async function sendAlertEmail(args: {
  to: string;
  subject: string;
  body: string;
  unsubscribeToken: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const unsubUrl = `${SITE_URL}/api/alerts/unsubscribe?t=${args.unsubscribeToken}`;
  const fullBody =
    `${args.body}\n\n---\nView the live map: ${SITE_URL}/map\n` +
    `Unsubscribe in one click: ${unsubUrl}\n` +
    `Sent by WatchDog · ${SITE_URL}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[alerts] RESEND_API_KEY not set — would send to ${args.to}: ${args.subject}\n${fullBody}`);
    return { ok: true };
  }

  const from = process.env.ALERTS_FROM ?? "WatchDog <alerts@watchdog.sf>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        text: fullBody,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `resend ${res.status}: ${errText.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

// Mark as used so eslint doesn't complain about the env import in build.
void env;
