import "server-only";
import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { OpenclawRealtime } from "./realtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageRow {
  id: number;
  slug: string;
  type: string;
  title: string;
  compiled_truth: string;
  created_at: string;
  updated_at: string;
  frontmatter: Record<string, unknown> | null;
}

interface IncidentRow {
  id: string;
  title: string;
  severity: "low" | "med" | "high";
  notes: string | null;
  created_at: string;
}

interface PageTagRow {
  page_id: number;
  tag: string;
}

interface ActivityCard {
  /** Unique key for React. */
  key: string;
  /** When this fused/landed. */
  ts: string;
  /** Incident id if known — drives link target. */
  incidentId: string | null;
  /** Final title (Claude's if enriched, otherwise raw). */
  title: string;
  /** Claude's narrative or null. */
  narrative: string | null;
  /** Decision hint pulled from tags if Claude provided one. */
  decisionHint: "act" | "hold" | "review" | "dismiss" | null;
  /** Whether Claude enriched this cluster. */
  enriched: boolean;
  /** Severity from incidents table. */
  severity: "low" | "med" | "high";
  /** All tags (region, signal, pattern, etc.). */
  tags: string[];
  /** Brief member breakdown ("11×camera_public") — pulled from raw fused text. */
  mix: string | null;
  /** The page slug (links to gbrain page if we surface that). */
  pageSlug: string | null;
}

const DECISION_VALUES = new Set(["act", "hold", "review", "dismiss"] as const);
type DecisionHint = "act" | "hold" | "review" | "dismiss";

function isDecision(v: string): v is DecisionHint {
  return DECISION_VALUES.has(v as DecisionHint);
}

async function loadActivity(): Promise<{
  cards: ActivityCard[];
  pageCount: number;
  incidentCount: number;
  enrichedCount: number;
  lastEventAt: string | null;
}> {
  const supabase = await createClient();

  // 1. Pull worker-emitted gbrain pages — the canonical "openclaw observation".
  const pagesRes = await supabase
    .from("pages")
    .select("id,slug,type,title,compiled_truth,created_at,updated_at,frontmatter")
    .eq("source_id", "watchdog")
    .filter("frontmatter->>source", "eq", "openclaw-worker")
    .order("updated_at", { ascending: false })
    .limit(80);
  if (pagesRes.error) throw new Error(pagesRes.error.message);
  const pages = (pagesRes.data ?? []) as PageRow[];

  // 2. Join back to incidents via frontmatter.related_incident_id.
  const incidentIds = Array.from(
    new Set(
      pages
        .map((p) => (p.frontmatter as { related_incident_id?: string } | null)?.related_incident_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const incidentMap = new Map<string, IncidentRow>();
  if (incidentIds.length > 0) {
    const incRes = await supabase
      .from("incidents")
      .select("id,title,severity,notes,created_at")
      .in("id", incidentIds);
    if (incRes.error) throw new Error(incRes.error.message);
    for (const inc of (incRes.data ?? []) as IncidentRow[]) {
      incidentMap.set(inc.id, inc);
    }
  }

  // 3. Pull tags for these pages.
  const pageIds = pages.map((p) => p.id);
  const tagMap = new Map<number, string[]>();
  if (pageIds.length > 0) {
    const tagsRes = await supabase
      .from("tags")
      .select("page_id,tag")
      .in("page_id", pageIds);
    if (!tagsRes.error) {
      for (const t of (tagsRes.data ?? []) as PageTagRow[]) {
        const list = tagMap.get(t.page_id) ?? [];
        list.push(t.tag);
        tagMap.set(t.page_id, list);
      }
    }
  }

  // 4. Build one card per page (which is 1:1 with an openclaw observation).
  let enrichedCount = 0;
  const cards: ActivityCard[] = pages.map((p) => {
    const fm = p.frontmatter as { related_incident_id?: string } | null;
    const relIncId = fm?.related_incident_id ?? null;
    const incident = relIncId ? incidentMap.get(relIncId) : undefined;

    const tags = tagMap.get(p.id) ?? [];
    const enriched = tags.includes("enriched:claude") || p.title.includes("🤖");
    if (enriched) enrichedCount++;

    // The page body for enriched cards starts with **title**\n\nnarrative.
    // Strip that out cleanly.
    let narrative: string | null = null;
    if (enriched) {
      const lines = p.compiled_truth.split("\n");
      // Skip leading **title** line + blank lines, take the next paragraph.
      const startIdx = lines.findIndex((l) => l.startsWith("**") && l.endsWith("**"));
      if (startIdx >= 0) {
        const slice = lines.slice(startIdx + 1).join("\n").trim();
        // First paragraph (up to the blank line before "decision hint" or members).
        narrative = slice
          .split(/\n\n/)[0]!
          .replace(/_decision hint:.*$/m, "")
          .trim();
      }
    }

    // Pull decision hint from tags.
    const decisionTag = tags.find((t) => t.startsWith("decision:"));
    const dec = decisionTag?.split(":")[1];
    const decisionHint = dec && isDecision(dec) ? dec : null;

    // Extract the "11×camera_public" mix from the compiled_truth if present.
    const mixMatch = p.compiled_truth.match(/(?:fused\s+)(\d+)\s+signals/i);
    const mix = mixMatch ? `${mixMatch[1]} signals` : null;

    return {
      key: p.slug,
      ts: p.updated_at ?? p.created_at,
      incidentId: relIncId,
      title: enriched ? p.title.replace(/^OpenClaw 🤖 /, "") : (incident?.title ?? p.title),
      narrative,
      decisionHint,
      enriched,
      severity: incident?.severity ?? "low",
      tags: tags.filter((t) => !t.startsWith("decision:")).slice(0, 8),
      mix,
      pageSlug: p.slug,
    };
  });

  cards.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return {
    cards: cards.slice(0, 50),
    pageCount: pages.length,
    incidentCount: incidentMap.size,
    enrichedCount,
    lastEventAt: cards[0]?.ts ?? null,
  };
}

function formatRelative(ts: string): string {
  const dt = Date.now() - new Date(ts).getTime();
  if (dt < 60_000) return `${Math.max(1, Math.floor(dt / 1000))}s ago`;
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

const SEVERITY_STYLES: Record<"low" | "med" | "high", string> = {
  high: "border-black bg-black text-white",
  med: "border-black bg-white text-black",
  low: "border-neutral-300 bg-white text-neutral-500",
};

const DECISION_STYLES: Record<DecisionHint, { label: string; cls: string }> = {
  act: { label: "act", cls: "border-black bg-black text-white" },
  hold: { label: "hold", cls: "border-black bg-white text-black" },
  review: { label: "review", cls: "border-neutral-400 bg-white text-neutral-600" },
  dismiss: { label: "dismiss", cls: "border-neutral-300 bg-neutral-50 text-neutral-400" },
};

function prettyTag(tag: string): string {
  // Strip the leading "kind:" prefix so the chip reads as the bare value.
  const idx = tag.indexOf(":");
  return idx > 0 ? tag.slice(idx + 1) : tag;
}

export default async function OpenclawPage() {
  const { cards, pageCount, incidentCount, enrichedCount, lastEventAt } =
    await loadActivity();

  return (
    <section className="flex h-full flex-col">
      <OpenclawRealtime />

      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm uppercase tracking-widest">
            OpenClaw <span className="text-neutral-300">· worker activity</span>
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {enrichedCount} enriched · {pageCount - enrichedCount} raw ·{" "}
            {incidentCount} incidents
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {lastEventAt ? `last: ${formatRelative(lastEventAt)}` : "no activity"}
        </span>
      </header>

      {cards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <div className="max-w-md space-y-3 text-center">
            <p className="font-mono text-sm text-neutral-500">
              The worker hasn't fired anything yet.
            </p>
            <p className="font-mono text-xs leading-relaxed text-neutral-400">
              Fusion mode only emits when fresh{" "}
              <code className="mx-1 bg-neutral-100 px-1">signal_events</code>
              cluster within 300 m / 90 s. Quiet feed = quiet city.
            </p>
          </div>
        </div>
      ) : (
        <ol className="flex-1 overflow-y-auto divide-y divide-neutral-200">
          {cards.map((c) => (
            <li
              key={c.key}
              className="flex flex-col gap-2 px-4 py-3 hover:bg-neutral-50"
            >
              {/* Top row: severity, title, time, link */}
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span
                    className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${SEVERITY_STYLES[c.severity]}`}
                  >
                    {c.severity}
                  </span>
                  {c.enriched && (
                    <span
                      title="Enriched by Claude"
                      className="shrink-0 border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-600"
                    >
                      claude
                    </span>
                  )}
                  <p className="min-w-0 truncate font-mono text-[13px] font-medium text-black">
                    {c.title}
                  </p>
                </div>
                <div className="flex shrink-0 items-baseline gap-3 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                  <span>{formatRelative(c.ts)}</span>
                  {c.incidentId && (
                    <Link
                      href={`/incidents/${c.incidentId}` as Route}
                      className="text-neutral-500 hover:text-black"
                    >
                      open →
                    </Link>
                  )}
                </div>
              </div>

              {/* Narrative */}
              {c.narrative && (
                <p className="font-mono text-[11px] leading-relaxed text-neutral-700">
                  {c.narrative}
                </p>
              )}

              {/* Bottom row: decision pill + tags + mix */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                {c.decisionHint && (
                  <span
                    className={`border px-1.5 py-0.5 ${DECISION_STYLES[c.decisionHint].cls}`}
                    title={`Claude's decision hint: ${c.decisionHint}`}
                  >
                    {DECISION_STYLES[c.decisionHint].label}
                  </span>
                )}
                {c.mix && <span className="text-neutral-500">{c.mix}</span>}
                {c.tags.map((t) => (
                  <span key={t} className="text-neutral-400">
                    #{prettyTag(t)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
