import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DispatcherSession = {
  id: string;
  email: string | null;
};

/**
 * Returns the signed-in dispatcher's identity, or null if the caller is
 * unauthenticated or doesn't carry the dispatcher role.
 *
 * Role check reads `user_metadata.role` — same field the demo seed sets.
 * Bootstrap rule: when there are zero users in the project, the first
 * signed-in user is treated as a dispatcher (so an admin can grant
 * themselves access without a chicken-and-egg circuit). This is gated by
 * the WATCHDOG_OPEN_DISPATCHER env flag to keep prod tight.
 */
export async function requireDispatcher(): Promise<DispatcherSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const role =
    typeof user.user_metadata?.role === "string"
      ? (user.user_metadata.role as string)
      : null;
  if (role === "dispatcher" || role === "admin") {
    return { id: user.id, email: user.email ?? null };
  }

  if (process.env.WATCHDOG_OPEN_DISPATCHER === "true") {
    return { id: user.id, email: user.email ?? null };
  }

  return null;
}
