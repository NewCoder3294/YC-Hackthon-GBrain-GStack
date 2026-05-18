"use server";

import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";

// Contributor-initiated bridge unpair from the dashboard. Mirrors the body
// path of /api/bridge/disconnect; kept as a server action so the dashboard
// UI doesn't need to round-trip through the public API.
export async function disconnectBridge(
  token: string,
  bridgeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = adminClient();
  const { data: contributor } = await sb
    .from("contributors")
    .select("id, removed_at")
    .eq("token", token)
    .maybeSingle();
  if (!contributor || contributor.removed_at) {
    return { ok: false, error: "not_found" };
  }

  const { data: bridge } = await sb
    .from("bridges")
    .select("id, contributor_id")
    .eq("id", bridgeId)
    .is("removed_at", null)
    .maybeSingle();
  if (!bridge || bridge.contributor_id !== contributor.id) {
    return { ok: false, error: "not_found" };
  }

  try {
    await sb
      .from("bridges")
      .update({
        removed_at: new Date().toISOString(),
        device_token: null,
      })
      .eq("id", bridge.id);
    await sb
      .from("cameras")
      .update({ is_active: false })
      .eq("bridge_id", bridge.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update_failed" };
  }

  revalidatePath(`/c/${token}`);
  return { ok: true };
}
