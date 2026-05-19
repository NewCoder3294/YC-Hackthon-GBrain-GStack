"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SavedView {
  id: string;
  name: string;
  queryString: string;
  createdAt: string;
}

const saveSchema = z.object({
  name: z.string().min(1).max(80),
  queryString: z.string().max(2000),
});

const idSchema = z.object({ id: z.string().uuid() });

export async function listSavedViews(): Promise<SavedView[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("saved_map_views")
    .select("id, name, query_string, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    queryString: r.query_string as string,
    createdAt: r.created_at as string,
  }));
}

export async function saveCurrentView(input: {
  name: string;
  queryString: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "unauthenticated" };
  const { data, error } = await supabase
    .from("saved_map_views")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      query_string: parsed.data.queryString,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "insert failed" };
  }
  revalidatePath("/map");
  return { ok: true, id: data.id as string };
}

export async function deleteSavedView(
  input: { id: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid id" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "unauthenticated" };
  // RLS enforces owner_id = auth.uid() so this is safe without an
  // explicit eq() guard, but include it for defense in depth.
  const { error } = await supabase
    .from("saved_map_views")
    .delete()
    .eq("id", parsed.data.id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/map");
  return { ok: true };
}
