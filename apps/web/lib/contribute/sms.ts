interface SendArgs {
  to: string;
  body: string;
}

export interface SendResult {
  channel: "sms" | "log";
  status: "sent" | "failed";
  error?: string;
}

export async function sendSms({ to, body }: SendArgs): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    console.log(`[SMS-LOG] ${to}`, body);
    return { channel: "log", status: "sent" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: `${res.status}` }));
    return { channel: "sms", status: "failed", error: data.message ?? String(res.status) };
  }
  return { channel: "sms", status: "sent" };
}
