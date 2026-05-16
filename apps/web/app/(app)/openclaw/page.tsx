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

interface TimelineEvent {
  ts: string;
  kind: "incident" | "page";
  /** For incidents: incident id. For pages: slug. */
  ref: string;
  title: string;
  subtitle: string;
  badge: string;
  link: Route | null;
  body: string;
}

async function loadActivity(): Promise<{
  events: TimelineEvent[];
  pageCount: number;
  incidentCount: number;
  lastEventAt: string | null;
}> {
  const supabase = await createClient();

  // Worker-emitted gbrain pages: source_id='watchdog' AND frontmatter.source='openclaw-worker'.
  const pagesRes = await supabase
    .from("pages")
    .select("id,slug,type,title,compiled_truth,created_at,updated_at,frontmatter")
    .eq("source_id", "watchdog")
    .filter("frontmatter->>source", "eq", "openclaw-worker")
    .order("updated_at", { ascending: false })
    .limit(80);

  if (pagesRes.error) {
    throw new Error(`pages query failed: ${pagesRes.error.message}`);
  }
  const pages = (pagesRes.data ?? []) as PageRow[];

  // Each intel_note page carries a related_incident_id in its frontmatter —
  // join those uuids back to incidents so we surface "incident posted" rows in
  // the timeline. No need for a WORKER_USER_ID env on the web side.
  const relatedIncidentIds = Array.from(
    new Set(
      pages
        .map((p) => (p.frontmatter as { related_incident_id?: string } | null)?.related_incident_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const incidents: IncidentRow[] =
    relatedIncidentIds.length === 0
      ? []
      : await (async () => {
          const incRes = await supabase
            .from("incidents")
            .select("id,title,severity,notes,created_at")
            .in("id", relatedIncidentIds)
            .order("created_at", { ascending: false });
          if (incRes.error) {
            throw new Error(`incidents query failed: ${incRes.error.message}`);
          }
          return (incRes.data ?? []) as IncidentRow[];
        })();

  const events: TimelineEvent[] = [];

  for (const inc of incidents) {
    events.push({
      ts: inc.created_at,
      kind: "incident",
      ref: inc.id,
      title: inc.title,
      subtitle: inc.notes?.slice(0, 120) ?? "",
      badge: `INCIDENT · ${inc.severity.toUpperCase()}`,
      link: `/incidents/${inc.id}` as Route,
      body: inc.notes ?? "",
    });
  }

  for (const p of pages) {
    const fm = p.frontmatter ?? {};
    const relInc = (fm as { related_incident_id?: string }).related_incident_id;
    events.push({
      ts: p.updated_at ?? p.created_at,
      kind: "page",
      ref: p.slug,
      title: p.title,
      subtitle: p.slug,
      badge: `${p.type.toUpperCase()} PAGE`,
      link: relInc ? (`/incidents/${relInc}` as Route) : null,
      body: p.compiled_truth.slice(0, 220),
    });
  }

  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return {
    events: events.slice(0, 60),
    pageCount: pages.length,
    incidentCount: incidents.length,
    lastEventAt: events[0]?.ts ?? null,
  };
}

function formatRelative(ts: string): string {
  const dt = Date.now() - new Date(ts).getTime();
  if (dt < 60_000) return `${Math.max(1, Math.floor(dt / 1000))}s ago`;
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export default async function OpenclawPage() {
  const { events, pageCount, incidentCount, lastEventAt } = await loadActivity();

  return (
    <section className="flex h-full flex-col">
      <OpenclawRealtime />

      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm uppercase tracking-widest">
            OpenClaw <span className="text-neutral-300">· worker activity</span>
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {events.length} events · {incidentCount} incidents ·{" "}
            {pageCount} pages
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {lastEventAt ? `last: ${formatRelative(lastEventAt)}` : "no activity yet"}
        </span>
      </header>

      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <div className="max-w-md space-y-3 text-center">
            <p className="font-mono text-sm text-neutral-500">
              The worker hasn't fired anything yet.
            </p>
            <p className="font-mono text-xs leading-relaxed text-neutral-400">
              In fusion mode, the worker only emits incidents when new
              <code className="mx-1 bg-neutral-100 px-1">signal_events</code>
              cluster within {300}m / {90}s. If
              <code className="mx-1 bg-neutral-100 px-1">signal_events</code>
              is quiet, this feed stays quiet — by design.
            </p>
            <p className="pt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
              start the worker locally:
              <span className="mt-1 block text-neutral-500">
                pnpm --filter @caltrans/openclaw-worker worker
              </span>
            </p>
          </div>
        </div>
      ) : (
        <ol className="flex-1 overflow-y-auto">
          {events.map((ev, i) => (
            <li
              key={`${ev.kind}-${ev.ref}-${i}`}
              className="border-b border-neutral-100 px-4 py-3 hover:bg-neutral-50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-neutral-400 tabular-nums">
                    {formatRelative(ev.ts)}
                  </span>
                  <span
                    className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${
                      ev.kind === "incident"
                        ? "border-black bg-black text-white"
                        : "border-neutral-300 bg-white text-neutral-500"
                    }`}
                  >
                    {ev.badge}
                  </span>
                  <p className="min-w-0 truncate font-mono text-[12px] font-medium text-black">
                    {ev.title}
                  </p>
                </div>
                {ev.link && (
                  <Link
                    href={ev.link}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
                  >
                    open →
                  </Link>
                )}
              </div>
              {ev.subtitle && (
                <p className="mt-1 pl-[6.5rem] font-mono text-[10px] text-neutral-500">
                  {ev.subtitle}
                </p>
              )}
              {ev.body && ev.kind === "page" && (
                <p className="mt-1 pl-[6.5rem] font-mono text-[10px] text-neutral-400 line-clamp-2">
                  {ev.body.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ")}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
