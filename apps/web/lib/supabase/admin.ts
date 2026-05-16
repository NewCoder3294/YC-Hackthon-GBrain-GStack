import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Use a permissive Database shape so insert/select payloads don't narrow to
// `never`. Generate real types via `supabase gen types typescript` later.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

let cached: SupabaseClient<AnyDb> | null = null;

export function adminClient(): SupabaseClient<AnyDb> {
  if (cached) return cached;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }
  cached = createClient<AnyDb>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
