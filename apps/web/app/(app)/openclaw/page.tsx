import "server-only";
import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { LiveStream } from "@/components/cameras/live-stream";
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

interface ClipRow {
  incident_id: string;
  cameras: {
    id: string;
    caltrans_id: string;
    route: string;
    direction: string | null;
    description: string;
    stream_url: string;
    stream_type: "hls" | "mjpeg";
  } | null;
}

interface PageTagRow {
  page_id: number;
  tag: string;
}

interface CameraInfo {
  streamUrl: string;
  streamType: "hls" | "mjpeg";
  /** "I-280 N" or similar — short location label */
  label: string;
}

interface ActivityCard {
  key: string;
  ts: string;
  incidentId: string | null;
  title: string;
  narrative: string | null;
  decisionHint: "act" | "hold" | "review" | "dismiss" | null;
  enriched: boolean;
  severity: "low" | "med" | "high";
  tags: string[];
  mix: string | null;
  camera: CameraInfo | null;
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

  // 1. Pull worker-emitted gbrain pages.
  const pagesRes = await supabase
    .from("pages")
    .select("id,slug,type,title,compiled_truth,created_at,updated_at,frontmatter")
    .eq("source_id", "watchdog")
    .filter("frontmatter->>source", "eq", "openclaw-worker")
    .order("updated_at", { ascending: false })
    .limit(80);
  if (pagesRes.error) throw new Error(pagesRes.error.message);
  const pages = (pagesRes.data ?? []) as PageRow[];

  // 2. Join to incidents.
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

  // 3. Join to clips → cameras for the live thumbnail.
  const cameraByIncident = new Map<string, CameraInfo>();
  if (incidentIds.length > 0) {
    const clipsRes = await supabase
      .from("clips")
      .select(
        "incident_id, cameras (id, caltrans_id, route, direction, description, stream_url, stream_type)",
      )
      .in("incident_id", incidentIds);
    if (!clipsRes.error) {
      for (const c of (clipsRes.data ?? []) as unknown as ClipRow[]) {
        if (!c.cameras || cameraByIncident.has(c.incident_id)) continue;
        cameraByIncident.set(c.incident_id, {
          streamUrl: c.cameras.stream_url,
          streamType: c.cameras.stream_type,
          label: c.cameras.direction
            ? `${c.cameras.route} ${c.cameras.direction}`
            : c.cameras.route,
        });
      }
    }
  }

  // 4. Pull tags for these pages.
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

  // 5. Build cards.
  let enrichedCount = 0;
  const cards: ActivityCard[] = pages.map((p) => {
    const fm = p.frontmatter as { related_incident_id?: string } | null;
    const relIncId = fm?.related_incident_id ?? null;
    const incident = relIncId ? incidentMap.get(relIncId) : undefined;
    const camera = relIncId ? cameraByIncident.get(relIncId) ?? null : null;

    const tags = tagMap.get(p.id) ?? [];
    const enriched = tags.includes("enriched:claude") || p.title.includes("🤖");
    if (enriched) enrichedCount++;

    let narrative: string | null = null;
    if (enriched) {
      const lines = p.compiled_truth.split("\n");
      const startIdx = lines.findIndex((l) => l.startsWith("**") && l.endsWith("**"));
      if (startIdx >= 0) {
        const slice = lines.slice(startIdx + 1).join("\n").trim();
        narrative = slice
          .split(/\n\n/)[0]!
          .replace(/_decision hint:.*$/m, "")
          .trim();
      }
    }

    const decisionTag = tags.find((t) => t.startsWith("decision:"));
    const dec = decisionTag?.split(":")[1];
    const decisionHint = dec && isDecision(dec) ? dec : null;

    const mixMatch = p.compiled_truth.match(/(?:fused\s+)(\d+)\s+signals/i);
    const mix = mixMatch ? `${mixMatch[1]} signals` : null;

    return {
      key: p.slug,
      ts: p.updated_at ?? p.created_at,
      incidentId: relIncId,
      title: enriched
        ? p.title.replace(/^OpenClaw 🤖 /, "")
        : incident?.title ?? p.title,
      narrative,
      decisionHint,
      enriched,
      severity: incident?.severity ?? "low",
      tags: tags
        .filter(
          (t) =>
            !t.startsWith("decision:") &&
            !t.startsWith("enriched:") &&
            !t.startsWith("severity:"),
        )
        .slice(0, 6),
      mix,
      camera,
    };
  });

  cards.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return {
    cards: cards.slice(0, 25),
    pageCount: pages.length,
    incidentCount: incidentMap.size,
    enrichedCount,
    lastEventAt: cards[0]?.ts ?? null,
  };
}

function formatRelative(ts: string): string {
  const dt = Date.now() - new Date(ts).getTime();
  if (dt < 60_000) return `${Math.max(1, Math.floor(dt / 1000))}s`;
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h`;
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

const SEVERITY_STRIPE: Record<"low" | "med" | "high", string> = {
  high: "bg-black",
  med: "bg-neutral-400",
  low: "bg-neutral-200",
};

const SEVERITY_LABEL: Record<"low" | "med" | "high", string> = {
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
          {lastEventAt ? `${formatRelative(lastEventAt)} ago` : "no activity"}
        </span>
      </header>

      {cards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <div className="max-w-md space-y-3 text-center">
            <p className="font-mono text-sm text-neutral-500">
              The worker hasn&apos;t fired anything yet.
            </p>
            <p className="font-mono text-xs leading-relaxed text-neutral-400">
              Fusion mode only emits when fresh{" "}
              <code className="mx-1 bg-neutral-100 px-1">signal_events</code>
              cluster within 300 m / 90 s. Quiet feed = quiet city.
            </p>
          </div>
        </div>
      ) : (
        <ol className="flex-1 overflow-y-auto divide-y divide-neutral-100">
          {cards.map((c) => (
            <li key={c.key} className="group">
              <Link
                href={
                  (c.incidentId ? `/incidents/${c.incidentId}` : "/openclaw") as Route
                }
                className="flex items-stretch gap-3 px-4 py-3 hover:bg-neutral-50"
              >
                {/* Severity stripe — quick scan column */}
                <span
                  aria-hidden
                  className={`shrink-0 self-stretch w-1 ${SEVERITY_STRIPE[c.severity]}`}
                />

                {/* Middle: title + narrative + meta */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${SEVERITY_LABEL[c.severity]}`}
                    >
                      {c.severity}
                    </span>
                    {c.enriched && (
                      <span
                        title="Claude-enriched"
                        className="shrink-0 border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-600"
                      >
                        claude
                      </span>
                    )}
                    {c.decisionHint && (
                      <span
                        className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${DECISION_STYLES[c.decisionHint].cls}`}
                        title="Claude decision hint"
                      >
                        {DECISION_STYLES[c.decisionHint].label}
                      </span>
                    )}
                    <p className="min-w-0 truncate font-mono text-[13px] font-medium text-black">
                      {c.title}
                    </p>
                  </div>

                  {c.narrative && (
                    <p className="font-mono text-[11px] leading-relaxed text-neutral-700 line-clamp-2">
                      {c.narrative}
                    </p>
                  )}

                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                    {c.mix && <span className="text-neutral-500">{c.mix}</span>}
                    {c.camera && (
                      <span className="text-neutral-500">{c.camera.label}</span>
                    )}
                    {c.tags.map((t) => (
                      <span key={t} className="text-neutral-400">
                        #{prettyTag(t)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Right: live thumbnail */}
                <div className="flex shrink-0 flex-col items-end justify-between gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 tabular-nums">
                    {formatRelative(c.ts)} ago
                  </span>
                  {c.camera ? (
                    <LiveStream
                      streamUrl={c.camera.streamUrl}
                      streamType={c.camera.streamType}
                      showLiveDot
                      className="h-[54px] w-[96px] rounded-sm border border-neutral-200"
                    />
                  ) : (
                    <div className="flex h-[54px] w-[96px] items-center justify-center rounded-sm border border-dashed border-neutral-200 font-mono text-[9px] uppercase tracking-widest text-neutral-300">
                      no clip
                    </div>
                  )}
                  <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 opacity-0 group-hover:opacity-100">
                    open →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
