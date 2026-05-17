import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OpenclawRealtime } from "./realtime";
import {
  OpenclawFeed,
  type ActivityCard,
  type CameraInfo,
  type DecisionHint,
  type Severity,
} from "./feed";

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
  severity: Severity;
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

const DECISION_VALUES = new Set<DecisionHint>(["act", "hold", "review", "dismiss"]);
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

  const pagesRes = await supabase
    .from("pages")
    .select("id,slug,type,title,compiled_truth,created_at,updated_at,frontmatter")
    .eq("source_id", "watchdog")
    .filter("frontmatter->>source", "eq", "openclaw-worker")
    .order("updated_at", { ascending: false })
    .limit(80);
  if (pagesRes.error) throw new Error(pagesRes.error.message);
  const pages = (pagesRes.data ?? []) as PageRow[];

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

  // Map each incident → its primary camera so we can render a live thumbnail
  // for that row. One query, then a Map lookup per card.
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

  let enrichedCount = 0;
  const cards: ActivityCard[] = pages.map((p) => {
    const fm = p.frontmatter as { related_incident_id?: string } | null;
    const relIncId = fm?.related_incident_id ?? null;
    const incident = relIncId ? incidentMap.get(relIncId) : undefined;

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
      ? p.title.replace(/^OpenClaw 🤖 /, "") // legacy stripper
      : incident?.title ?? p.title,
      narrative,
      decisionHint,
      enriched,
      severity: incident?.severity ?? "low",
      tags: tags.filter((t) => !t.startsWith("decision:")).slice(0, 8),
      mix,
      pageSlug: p.slug,
      camera: relIncId ? cameraByIncident.get(relIncId) ?? null : null,
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

function formatRelative(ts: string | null): string {
  if (!ts) return "—";
  const dt = Date.now() - new Date(ts).getTime();
  if (dt < 60_000) return `${Math.max(1, Math.floor(dt / 1000))}s`;
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h`;
  return new Date(ts).toISOString().slice(5, 16).replace("T", " ");
}

export default async function OpenclawPage() {
  const { cards, pageCount, incidentCount, enrichedCount, lastEventAt } =
    await loadActivity();
  const rawCount = pageCount - enrichedCount;
  const enrichedPct = pageCount > 0 ? Math.round((enrichedCount / pageCount) * 100) : 0;

  return (
    <section className="relative flex h-full flex-col">
      <OpenclawRealtime />

      <header className="border-b border-neutral-200 px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm uppercase tracking-widest">
            <span className="border-b-2 border-amber-400 pb-0.5">Open</span>Claw
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            Worker activity feed
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-neutral-200 bg-neutral-200 sm:grid-cols-4">
        <Stat
          label="Observations"
          value={pageCount.toString()}
          sub={`${rawCount} raw`}
        />
        <Stat
          label="Enriched"
          value={enrichedCount.toString()}
          sub={`${enrichedPct}% by Claude`}
        />
        <Stat label="Incidents" value={incidentCount.toString()} sub="linked" />
        <Stat
          label="Last event"
          value={lastEventAt ? formatRelative(lastEventAt) : "—"}
          sub={lastEventAt ? "ago" : "no activity"}
        />
      </div>

      <OpenclawFeed cards={cards} />
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg tabular-nums">{value}</div>
      {sub && (
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {sub}
        </div>
      )}
    </div>
  );
}
