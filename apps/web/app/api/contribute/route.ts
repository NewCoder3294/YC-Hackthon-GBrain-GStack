import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { generateContributorToken } from "@/lib/contribute/token";
import { generateVerificationCode } from "@/lib/contribute/code";
import { sendSms } from "@/lib/contribute/sms";
import {
  RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Loose shape for the admin Supabase client. adminClient() is typed with
// Database = any, which causes supabase-js's insert/select chain to resolve
// row types to `never`. The contributors/cameras tables aren't in a
// generated Database type for this project, so we cast through this shape.
type LooseInsertResult = {
  data: { id: string; token: string } | null;
  error: { message: string; code?: string } | null;
};
type LooseTableMutation = Promise<{ error: { message: string; code?: string } | null }> & {
  select: (cols: string) => { single: () => Promise<LooseInsertResult> };
};
type LooseTable = {
  insert: (row: Record<string, unknown>) => LooseTableMutation;
};
type LooseAdminClient = { from: (table: string) => LooseTable };

// Phone-as-bridge onboarding: shop owners shouldn't be asked to expose a
// camera over the public internet before they've even signed up. They land
// here with just name + phone + location, get verified, then the dashboard
// guides them through the WatchDog app pairing. The stream_url/lat/lng path
// stays optional so power users (or vendor-cloud OAuth flows) can pre-attach
// a camera at signup.
const schema = z.object({
  name: z.string().min(1).max(200),
  contact_phone: z.string().regex(/^\+\d{10,15}$/, "phone must be E.164"),
  contact_email: z.string().email().optional(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  stream_url: z.string().url().optional(),
  stream_type: z.enum(["hls", "mjpeg"]).default("hls"),
  hours: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  const rate = await checkRateLimit(request, {
    ...RATE_LIMITS.publicWrite,
    keyPrefix: "api:contribute",
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = adminClient() as unknown as LooseAdminClient;

  const token = generateContributorToken();
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  const { data: contributor, error: insertErr } = await supabase
    .from("contributors")
    .insert({
      name: body.name,
      contact_phone: body.contact_phone,
      contact_email: body.contact_email ?? null,
      token,
      verification_code: code,
      verification_expires_at: expiresAt,
      hours_json: body.hours ?? null,
    })
    .select("id, token")
    .single();
  if (insertErr || !contributor) {
    if (insertErr?.code === "23505") {
      return NextResponse.json({ error: "phone_already_registered" }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr?.message ?? "insert_failed" }, { status: 500 });
  }

  // Camera row is only created when the contributor supplies a stream URL at
  // signup (legacy path / vendor-cloud OAuth path). Bridge-paired cameras
  // get inserted later from /api/bridge/cameras once the WatchDog app
  // discovers them on the LAN.
  if (body.stream_url && body.lat !== undefined && body.lng !== undefined) {
    const caltransId = `CONTRIB-${contributor.id.slice(0, 8)}`;
    const { error: camErr } = await supabase.from("cameras").insert({
      caltrans_id: caltransId,
      district: 4,
      route: "contributor",
      direction: null,
      description: body.name,
      lat: body.lat,
      lng: body.lng,
      stream_url: body.stream_url,
      stream_type: body.stream_type,
      is_active: false,
      contributor_id: contributor.id,
    });
    if (camErr) {
      return NextResponse.json({ error: camErr.message }, { status: 500 });
    }
  }

  const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const dashboardUrl = `${origin}/c/${contributor.token}`;
  const verifyUrl = `${dashboardUrl}/verify`;
  const installUrl = `${dashboardUrl}/install`;

  await sendSms({
    to: body.contact_phone,
    body: `WatchDog: your verification code is ${code}. Enter at ${verifyUrl}`,
  });

  return NextResponse.json({
    contributor_id: contributor.id,
    dashboard_url: dashboardUrl,
    verify_url: verifyUrl,
    install_url: installUrl,
    needs_install: !body.stream_url,
  });
}
