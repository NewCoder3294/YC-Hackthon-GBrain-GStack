import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const ENV_SIGNALS_CACHE_TAG = "env-signals";

export type EnvSignalKind =
  | "weather"
  | "aqi"
  | "quake"
  | "aircraft"
  | "vessel"
  | "transit";

export interface EnvSignalRow {
  id: string;
  kind: EnvSignalKind;
  source: string;
  title: string;
  subtitle: string | null;
  severity: "low" | "med" | "high";
  lat: number | null;
  lng: number | null;
  occurredAt: string;
  expiresAt: string | null;
}

async function loadEnv(): Promise<EnvSignalRow[]> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("env_signals")
    .select("id, kind, source, title, subtitle, severity, lat, lng, occurred_at, expires_at")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    kind: r.kind as EnvSignalKind,
    source: r.source as string,
    title: r.title as string,
    subtitle: r.subtitle as string | null,
    severity:
      r.severity === "high" ? "high" : r.severity === "med" ? "med" : "low",
    lat: r.lat as number | null,
    lng: r.lng as number | null,
    occurredAt: r.occurred_at as string,
    expiresAt: r.expires_at as string | null,
  }));
}

export const loadEnvSignals = unstable_cache(
  loadEnv,
  ["cockpit:env-signals:v1"],
  { revalidate: 60, tags: [ENV_SIGNALS_CACHE_TAG] },
);
