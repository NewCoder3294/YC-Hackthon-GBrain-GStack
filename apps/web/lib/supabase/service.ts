import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client.
 *
 * Bypasses RLS — use ONLY in trusted server code (route handlers, cron jobs).
 * Unlike the SSR clients in `./server` and `./browser`, this client carries no
 * cookies and never persists a session: it authenticates purely with the
 * service-role key.
 */
export function createServiceClient(): SupabaseClient {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — cannot create service-role client",
    );
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
