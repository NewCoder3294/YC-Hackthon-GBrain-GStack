"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const decideSchema = z.object({
  incidentId: z.string().uuid(),
  outcome: z.enum(["act", "hold", "dismiss"]),
  reason: z.string().max(2000).nullable(),
  reviewer: z.string().min(1).max(64),
});

export async function recordDecision(input: z.infer<typeof decideSchema>) {
  const parsed = decideSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("decisions")
    .upsert(
      {
        incident_id: parsed.incidentId,
        outcome: parsed.outcome,
        reason: parsed.reason,
        reviewer: parsed.reviewer,
        decided_at: new Date().toISOString(),
      },
      { onConflict: "incident_id" },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/kg");
  revalidatePath("/incidents");
  revalidatePath(`/incidents/${parsed.incidentId}`);
}

const ackSchema = z.object({
  alertId: z.string().uuid(),
});

export async function acknowledgeAlert(input: z.infer<typeof ackSchema>) {
  const parsed = ackSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("predictive_alerts")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", parsed.alertId);
  if (error) throw new Error(error.message);
  revalidatePath("/kg");
}

const noteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(8000),
  tags: z.array(z.string().max(40)).max(20),
  relatedIncidentId: z.string().uuid().nullable(),
  relatedGangId: z.string().uuid().nullable(),
});

export async function writeIntelNote(input: z.infer<typeof noteSchema>) {
  const parsed = noteSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from("gbrain_records").insert({
    kind: "intel_note",
    title: parsed.title,
    body: parsed.body,
    tags: parsed.tags,
    related_incident_id: parsed.relatedIncidentId,
    related_gang_id: parsed.relatedGangId,
    source: "manual",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/kg");
}
