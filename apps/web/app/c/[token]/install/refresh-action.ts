"use server";

import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";

// Expire the contributor's currently-pending bridge so the next
// /c/[token]/install render mints a fresh pairing code via
// getOrCreatePendingBridge. Idempotent — no-op when the contributor has
// no live pending row.
export async function refreshPairingCode(
  token: string,
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

  try {
    await sb
      .from("bridges")
      .update({ pairing_expires_at: new Date(0).toISOString() })
      .eq("contributor_id", contributor.id)
      .is("paired_at", null)
      .is("removed_at", null);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update_failed" };
  }

  revalidatePath(`/c/${token}/install`);
  return { ok: true };
}
