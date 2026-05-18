import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { LiveIncident } from "@/lib/live-incidents";

/**
 * Annotates a batch of LiveIncident rows with their cross-source
 * corroboration count (`corroboratingSources`) read from the
 * `live_incidents_verification` SQL view.
 *
 * Source: see migration 0015. An incident is "verified" (badge=✓) when
 * at least one other incident from a DIFFERENT source landed within
 * 200m and ±10 minutes.
 */
export async function attachVerification(
  rows: LiveIncident[],
): Promise<LiveIncident[]> {
  if (rows.length === 0) return rows;

  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  const ids = rows.map((r) => r.id);
  const { data, error } = await supabase
    .from("live_incidents_verification")
    .select("id, corroborating_sources")
    .in("id", ids);
  if (error || !data) {
    // Verification is best-effort — never block the live feed on it.
    return rows;
  }
  const counts = new Map<string, number>();
  for (const row of data) {
    counts.set(
      (row as { id: string }).id,
      (row as { corroborating_sources: number }).corroborating_sources ?? 0,
    );
  }
  return rows.map((r) => ({
    ...r,
    corroboratingSources: counts.get(r.id) ?? 0,
  }));
}
