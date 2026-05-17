import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OpenClaw worker -> WatchDog ingestion endpoint.
 *
 * The worker calls this after it detects a clip-worthy event in a live
 * feed. We persist the incident and clips, then call
 * refresh_predictive_alerts() so the response includes the count of
 * alerts that fired from this ingest. (The database trigger also fires
 * it, but the RPC call here lets the worker see how many alerts the
 * ingest produced.)
 *
 * Auth: bearer token must match CRON_SECRET (re-used as the worker
 * secret; v2 will issue per-worker identities).
 */
const ingestSchema = z.object({
  incident: z.object({
    title: z.string().min(1).max(200),
    notes: z.string().max(4000).optional(),
    severity: z.enum(["low", "med", "high"]).default("low"),
    created_by: z.string().uuid(),
    suspect_gang_id: z.string().uuid().optional(),
  }),
  clips: z
    .array(
      z.object({
        caltrans_id: z.string().optional(),
        camera_id: z.string().uuid().optional(),
        started_at: z.string(),
        duration_s: z.number().int().positive(),
        storage_path: z.string(),
        thumbnail_path: z.string(),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 500 },
    );
  }

  let parsed: z.infer<typeof ingestSchema>;
  try {
    const body = await request.json();
    parsed = ingestSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid payload",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  // Service-role client (bypasses RLS — this endpoint is gated by CRON_SECRET).
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );

  try {
    const { data: incident, error: incErr } = await supabase
      .from("incidents")
      .insert({
        title: parsed.incident.title,
        notes: parsed.incident.notes ?? null,
        severity: parsed.incident.severity,
        created_by: parsed.incident.created_by,
        suspect_gang_id: parsed.incident.suspect_gang_id ?? null,
      })
      .select("id")
      .single();
    if (incErr || !incident) {
      throw new Error(incErr?.message ?? "incident insert returned nothing");
    }

    for (const c of parsed.clips) {
      let cameraId = c.camera_id ?? null;
      if (!cameraId && c.caltrans_id) {
        const { data: found } = await supabase
          .from("cameras")
          .select("id")
          .eq("caltrans_id", c.caltrans_id)
          .limit(1)
          .maybeSingle();
        cameraId = (found?.id as string | undefined) ?? null;
      }
      if (!cameraId) {
        throw new Error(
          `clip references unknown camera (caltrans_id=${c.caltrans_id})`,
        );
      }
      const { error: clipErr } = await supabase.from("clips").insert({
        incident_id: incident.id,
        camera_id: cameraId,
        started_at: c.started_at,
        duration_s: c.duration_s,
        storage_path: c.storage_path,
        thumbnail_path: c.thumbnail_path,
      });
      if (clipErr) throw new Error(clipErr.message);
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "refresh_predictive_alerts",
    );
    if (rpcErr) throw new Error(rpcErr.message);
    const newAlerts =
      typeof rpcData === "number" ? rpcData : Number(rpcData) || 0;

    return NextResponse.json({
      ok: true,
      incident_id: incident.id as string,
      clips: parsed.clips.length,
      new_alerts: newAlerts,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "ingest failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
