import { cache } from "react";
import { adminClient } from "@/lib/supabase/admin";

export const getContributor = cache(async (token: string) => {
  const supabase = adminClient();
  const { data } = await supabase
    .from("contributors")
    .select("id, name, contact_phone, verified_at, removed_at, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.removed_at) return null;
  return data;
});
