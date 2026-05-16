import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: ReturnType<typeof createClient> | null = null;

export function adminClient() {
  if (cached) return cached;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
