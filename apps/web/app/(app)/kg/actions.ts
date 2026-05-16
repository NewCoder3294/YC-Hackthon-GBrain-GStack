"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface GbrainSearchHit {
  id: string;
  kind: string;
  title: string;
  body: string;
  tags: string[];
  related_incident_id: string | null;
  related_gang_id: string | null;
  confidence: number | null;
  samples: number | null;
  rank: number;
}

const searchSchema = z.object({
  q: z.string().min(1).max(400),
  limit: z.number().int().min(1).max(40).optional(),
});

export async function searchGbrain(
  input: z.infer<typeof searchSchema>,
): Promise<GbrainSearchHit[]> {
  const parsed = searchSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gbrain_search", {
    q: parsed.q,
    match_limit: parsed.limit ?? 12,
    kinds: null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as GbrainSearchHit[];
}

const priorSchema = z.object({
  incidentId: z.string().uuid(),
  limit: z.number().int().min(1).max(20).optional(),
});

export async function gbrainPriorContext(
  input: z.infer<typeof priorSchema>,
): Promise<GbrainSearchHit[]> {
  const parsed = priorSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gbrain_prior_context", {
    incident_uuid: parsed.incidentId,
    match_limit: parsed.limit ?? 8,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as GbrainSearchHit[];
}

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
  const slug =
    "intel_note-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);
  const { data: page, error: pageErr } = await supabase
    .from("pages")
    .insert({
      source_id: "watchdog",
      slug,
      type: "intel_note",
      page_kind: "markdown",
      title: parsed.title,
      compiled_truth: parsed.body,
      frontmatter: {
        kind: "intel_note",
        related_incident_id: parsed.relatedIncidentId,
        related_gang_id: parsed.relatedGangId,
        source: "manual",
      },
    })
    .select("id")
    .single();
  if (pageErr) throw new Error(pageErr.message);
  if (parsed.tags.length > 0 && page) {
    const { error: tagErr } = await supabase
      .from("tags")
      .insert(parsed.tags.map((tag) => ({ page_id: page.id, tag })));
    if (tagErr) throw new Error(tagErr.message);
  }
  revalidatePath("/kg");
}
