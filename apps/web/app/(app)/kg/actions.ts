"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireDispatcher } from "@/lib/auth/require-dispatcher";

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
  const dispatcher = await requireDispatcher();
  if (!dispatcher) throw new Error("forbidden");
  const parsed = decideSchema.parse(input);
  const supabase = await createClient();
  const decidedAt = new Date().toISOString();

  const { error } = await supabase
    .from("decisions")
    .upsert(
      {
        incident_id: parsed.incidentId,
        outcome: parsed.outcome,
        reason: parsed.reason,
        reviewer: parsed.reviewer,
        decided_at: decidedAt,
      },
      { onConflict: "incident_id" },
    );
  if (error) throw new Error(error.message);

  // Write the decision as a reviewed_incident page in the gbrain pages table
  // so it joins the institutional memory layer that gbrain_prior_context queries
  // against. Slug is deterministic per incident → upsert on re-decide.
  try {
    await writeReviewedIncidentPage(supabase, {
      incidentId: parsed.incidentId,
      outcome: parsed.outcome,
      reason: parsed.reason,
      reviewer: parsed.reviewer,
      decidedAt,
    });
  } catch (e) {
    // Don't let a gbrain write failure block the decision write — the decision
    // is the source of truth. Just log and move on.
    console.error(
      "[recordDecision] gbrain page write failed:",
      e instanceof Error ? e.message : e,
    );
  }

  // Hold-decision fan-out: request access through the policy enforcer for
  // every camera linked to this incident via a clip. Each call writes its
  // own camera_access_events row (allowed or denied) — gives the citizen
  // an audit trail even when the policy declines. Default basis for an
  // implicit Hold request is standing_consent; the explicit per-camera UI
  // in the incident sidebar covers exigent / warrant claims.
  if (parsed.outcome === "hold") {
    try {
      const { data: clipRows } = await supabase
        .from("clips")
        .select("camera_id")
        .eq("incident_id", parsed.incidentId);
      const uniqueCameras = [
        ...new Set(
          (clipRows ?? [])
            .map((r) => (r as { camera_id: string | null }).camera_id)
            .filter((id): id is string => !!id),
        ),
      ];

      // Idempotency: if a Hold-flavoured audit row already exists for the
      // (incident, camera) pair, don't re-emit it. Re-deciding Hold on the
      // same incident is allowed (the dispatcher may revisit) but should
      // not duplicate the citizen's audit log.
      const accessedBy = `dispatcher:${parsed.reviewer}`;
      const { data: existing } = await supabase
        .from("camera_access_events")
        .select("camera_id")
        .eq("incident_id", parsed.incidentId)
        .eq("accessed_by", accessedBy)
        .like("reason", "hold:%");
      const alreadyEmitted = new Set(
        (existing ?? []).map(
          (r) => (r as { camera_id: string }).camera_id,
        ),
      );
      const toCall = uniqueCameras.filter((id) => !alreadyEmitted.has(id));

      await Promise.all(
        toCall.map((cameraId) =>
          supabase.rpc("request_camera_access", {
            p_camera_id: cameraId,
            p_incident_id: parsed.incidentId,
            p_accessed_by: accessedBy,
            p_legal_basis: "standing_consent",
            p_reason: `hold: ${parsed.reason ?? "pending corroboration"}`,
            p_has_warrant: false,
            p_is_exigent: false,
          }),
        ),
      );
    } catch (e) {
      console.error(
        "[recordDecision] hold fan-out failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  revalidatePath("/kg");
  revalidatePath("/incidents");
  revalidatePath(`/incidents/${parsed.incidentId}`);
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function writeReviewedIncidentPage(
  supabase: SupabaseClient,
  d: {
    incidentId: string;
    outcome: "act" | "hold" | "dismiss";
    reason: string | null;
    reviewer: string;
    decidedAt: string;
  },
) {
  // Look up incident details we need for the page (title, severity, gang).
  const { data: inc, error: incErr } = await supabase
    .from("incidents")
    .select("title, severity, suspect_gang_id")
    .eq("id", d.incidentId)
    .single();
  if (incErr || !inc) throw new Error(incErr?.message ?? "incident not found");

  // Resolve gang name if we have one — humans + gbrain FTS prefer the name.
  let gangName: string | null = null;
  if (inc.suspect_gang_id) {
    const { data: gang } = await supabase
      .from("gangs")
      .select("name")
      .eq("id", inc.suspect_gang_id)
      .maybeSingle();
    gangName = (gang?.name as string | undefined) ?? null;
  }

  const compiledTruth = [
    `**Dispatcher decision:** ${d.outcome}`,
    "",
    `**Reason:** ${d.reason && d.reason.trim().length > 0 ? d.reason : "—"}`,
    "",
    `**Suspect gang:** ${gangName ?? "—"}`,
    "",
    `**Severity:** ${inc.severity}`,
  ].join("\n");

  const slug = `reviewed_incident-${d.incidentId.replace(/-/g, "")}`;
  const frontmatter = {
    kind: "reviewed_incident",
    meta: { reviewer: d.reviewer, decided_at: d.decidedAt },
    source: "derived",
    samples: null,
    confidence: null,
    created_at: d.decidedAt,
    related_gang_id: inc.suspect_gang_id ?? null,
    related_incident_id: d.incidentId,
  };

  const { data: page, error: pageErr } = await supabase
    .from("pages")
    .upsert(
      {
        source_id: "watchdog",
        slug,
        type: "reviewed_incident",
        page_kind: "markdown",
        title: inc.title,
        compiled_truth: compiledTruth,
        frontmatter,
      },
      { onConflict: "source_id,slug" },
    )
    .select("id")
    .single();
  if (pageErr || !page) {
    throw new Error(pageErr?.message ?? "page upsert returned nothing");
  }

  // Refresh tags — clear existing then insert the canonical set so re-decisions
  // don't accumulate stale tags.
  await supabase.from("tags").delete().eq("page_id", page.id);
  const tags = [
    `decision:${d.outcome}`,
    `incident:${inc.severity}`,
    ...(inc.suspect_gang_id ? [`gang:${inc.suspect_gang_id}`] : []),
  ];
  const { error: tagErr } = await supabase
    .from("tags")
    .insert(tags.map((tag) => ({ page_id: page.id, tag })));
  if (tagErr) throw new Error(tagErr.message);
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
