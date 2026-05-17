import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { enrichIncident } from "@/lib/enrichment/pipeline";
import type { IncidentContext } from "@/lib/enrichment/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 5 minutes — the pipeline does sequential Firecrawl + ZeroEntropy
// + 3x Claude calls per incident, and we may enrich up to MAX_PER_RUN of them.
export const maxDuration = 300;

const MAX_PER_RUN = 25;

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

function buildLocation(row: IncidentRow): string | null {
  const cam = row.clips[0]?.cameras;
  if (!cam) return null;
  const dir = cam.direction ? ` ${cam.direction}` : "";
  return `${cam.route}${dir} · ${cam.description}`;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.FIRECRAWL_API_KEY || !env.ZEROENTROPY_API_KEY || !env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "missing enrichment API key(s)" },
      { status: 500 },
    );
  }

  const supabase = createServiceClient();

  // Pull incidents that don't yet have any web_context page. We store enriched
  // results in the `pages` table (source_id="watchdog", type="web_context")
  // so they flow through the same KG loader as other GBrain records.
  const { data: alreadyEnrichedRows, error: enrichedErr } = await supabase
    .from("pages")
    .select("frontmatter")
    .eq("source_id", "watchdog")
    .eq("type", "web_context");
  if (enrichedErr) {
    return NextResponse.json({ error: enrichedErr.message }, { status: 500 });
  }
  const enrichedIds = new Set<string>();
  for (const row of alreadyEnrichedRows ?? []) {
    const fm = (row as { frontmatter: { related_incident_id?: string } | null }).frontmatter;
    if (fm?.related_incident_id) enrichedIds.add(fm.related_incident_id);
  }

  const { data: incidentRows, error: incErr } = await supabase
    .from("incidents")
    .select(
      "id, title, severity, created_at, clips (cameras (route, direction, description))",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (incErr) {
    return NextResponse.json({ error: incErr.message }, { status: 500 });
  }

  const pending = ((incidentRows ?? []) as unknown as IncidentRow[])
    .filter((r) => !enrichedIds.has(r.id))
    .slice(0, MAX_PER_RUN);

  const summary = {
    candidates: pending.length,
    enriched: 0,
    skipped_no_hits: 0,
    errors: [] as Array<{ incidentId: string; error: string }>,
    inserted: 0,
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
      summary.errors.push({
        incidentId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (hits.length === 0) {
      summary.skipped_no_hits++;
      continue;
    }

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
      summary.errors.push({ incidentId: row.id, error: insertErr.message });
      continue;
    }
    summary.enriched++;
    summary.inserted += rows.length;
  }

  return NextResponse.json(summary);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
