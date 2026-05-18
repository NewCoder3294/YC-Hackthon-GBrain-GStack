import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const TRAFFIC_DISRUPTIONS_CACHE_TAG = "traffic-disruptions";

export interface TrafficDisruption {
  id: string;
  /** "I-80 W Westbound · Disabled vehicle" — pre-shaped by the 511 ingester. */
  summary: string;
  severity: "low" | "med" | "high";
  status: string | null;
  occurredAt: string;
}

async function loadDisruptions(): Promise<TrafficDisruption[]> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  // Pull last 48h of 511 traffic events. CHP/511 don't always set a clean
  // resolved status, so we surface everything in the window and let the UI
  // age-sort it.
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("live_incidents")
    .select("id, subtitle, title, severity, status, occurred_at")
    .eq("source", "511_traffic")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    // Subtitle is the most compact summary; fall back to title if missing.
    summary: ((r.subtitle as string | null) ?? (r.title as string)).trim(),
    severity:
      (r.severity as string) === "high"
        ? "high"
        : (r.severity as string) === "med"
          ? "med"
          : "low",
    status: r.status as string | null,
    occurredAt: r.occurred_at as string,
  }));
}

export const loadTrafficDisruptions = unstable_cache(
  loadDisruptions,
  ["cockpit:traffic-disruptions:v1"],
  { revalidate: 300, tags: [TRAFFIC_DISRUPTIONS_CACHE_TAG] },
);
