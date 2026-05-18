"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  notes: z.string().max(4000).nullable(),
  severity: z.enum(["low", "med", "high"]),
});

export async function updateIncident(input: z.infer<typeof updateSchema>) {
  const parsed = updateSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("incidents")
    .update({
      title: parsed.title,
      notes: parsed.notes,
      severity: parsed.severity,
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  revalidatePath("/incidents");
  revalidatePath(`/incidents/${parsed.id}`);
}

const tagSchema = z.object({
  clipId: z.string().uuid(),
  tag: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits, hyphens"),
  incidentId: z.string().uuid(),
});

export async function addClipTag(input: z.infer<typeof tagSchema>) {
  const parsed = tagSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("clip_tags")
    .upsert({ clip_id: parsed.clipId, tag: parsed.tag });
  if (error) throw new Error(error.message);
  revalidatePath(`/incidents/${parsed.incidentId}`);
}

export async function removeClipTag(input: z.infer<typeof tagSchema>) {
  const parsed = tagSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("clip_tags")
    .delete()
    .eq("clip_id", parsed.clipId)
    .eq("tag", parsed.tag);
  if (error) throw new Error(error.message);
  revalidatePath(`/incidents/${parsed.incidentId}`);
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteIncident(input: z.infer<typeof deleteSchema>) {
  const parsed = deleteSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("incidents")
    .delete()
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath("/incidents");
}
