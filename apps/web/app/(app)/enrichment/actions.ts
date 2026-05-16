"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { enrichIncident } from "@/lib/enrichment/pipeline";
import type { IncidentContext } from "@/lib/enrichment/types";

const MAX_PER_INVOCATION = 5;

interface IncidentRow {
  id: string;
  title: string;
  severity: "low" | "med" | "high";
  created_at: string;
  clips: Array<{
    cameras: {
      route: string;
      direction: string | null;
      description: string;
    } | null;
  }>;
}

export interface RunNowResult {
  ok: boolean;
  message: string;
  candidates: number;
  enriched: number;
  inserted: number;
  errors: string[];
}

function buildLocation(row: IncidentRow): string | null {
  const cam = row.clips[0]?.cameras;
  if (!cam) return null;
  const dir = cam.direction ? ` ${cam.direction}` : "";
  return `${cam.route}${dir} · ${cam.description}`;
}

export async function runEnrichmentNow(): Promise<RunNowResult> {
  if (!env.FIRECRAWL_API_KEY || !env.ZEROENTROPY_API_KEY || !env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      message: "missing one or more enrichment API keys",
      candidates: 0,
      enriched: 0,
      inserted: 0,
      errors: [],
    };
  }
  const supabase = createServiceClient();

  const { data: alreadyRows, error: enrichedErr } = await supabase
    .from("pages")
    .select("frontmatter")
    .eq("source_id", "watchdog")
    .eq("type", "web_context");
  if (enrichedErr) {
    return {
      ok: false,
      message: enrichedErr.message,
      candidates: 0,
      enriched: 0,
      inserted: 0,
      errors: [enrichedErr.message],
    };
  }
  const enrichedIds = new Set<string>();
  for (const row of alreadyRows ?? []) {
    const fm = (row as { frontmatter: { related_incident_id?: string } | null }).frontmatter;
    if (fm?.related_incident_id) enrichedIds.add(fm.related_incident_id);
  }

  const { data: incidentRows, error: incErr } = await supabase
    .from("incidents")
    .select(
      "id, title, severity, created_at, clips (cameras (route, direction, description))",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (incErr) {
    return {
      ok: false,
      message: incErr.message,
      candidates: 0,
      enriched: 0,
      inserted: 0,
      errors: [incErr.message],
    };
  }

  const pending = ((incidentRows ?? []) as unknown as IncidentRow[])
    .filter((r) => !enrichedIds.has(r.id))
    .slice(0, MAX_PER_INVOCATION);

  const result: RunNowResult = {
    ok: true,
    message: `processed ${pending.length} incident(s)`,
    candidates: pending.length,
    enriched: 0,
    inserted: 0,
    errors: [],
  };

  const keys = {
    firecrawl: env.FIRECRAWL_API_KEY!,
    zeroentropy: env.ZEROENTROPY_API_KEY!,
    anthropic: env.ANTHROPIC_API_KEY!,
  };

  for (const row of pending) {
    const ctx: IncidentContext = {
      id: row.id,
      title: row.title,
      severity: row.severity,
      createdAt: row.created_at,
      location: buildLocation(row),
    };
    let hits;
    try {
      hits = await enrichIncident(ctx, keys);
    } catch (err) {
      result.errors.push(
        `${row.id}: ${err instanceof Error ? err.message : "enrich failed"}`,
      );
      continue;
    }
    if (hits.length === 0) continue;

    const rows = hits.map((h, idx) => ({
      source_id: "watchdog",
      slug: `web-context/${row.id}/${idx}-${safeHost(h.url) || "result"}`,
      type: "web_context",
      title: h.title.slice(0, 240),
      compiled_truth: h.description.slice(0, 2000),
      frontmatter: {
        url: h.url,
        verdict: h.verdict,
        reasoning: h.reasoning,
        relevance: h.relevance,
        source_host: safeHost(h.url),
        related_incident_id: row.id,
        confidence: h.confidence,
        source: "web:firecrawl",
      },
    }));

    const { error: insertErr } = await supabase.from("pages").insert(rows);
    if (insertErr) {
      result.errors.push(`${row.id}: ${insertErr.message}`);
      continue;
    }
    result.enriched++;
    result.inserted += rows.length;
  }

  revalidatePath("/enrichment");
  revalidatePath("/kg");
  return result;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
