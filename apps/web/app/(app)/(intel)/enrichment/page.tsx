import { createClient } from "@/lib/supabase/server";
import { RunNowButton } from "./run-button";
import { WebSearchView, type Verdict, type WebSearchRow } from "./web-search-view";

export const dynamic = "force-dynamic";

interface WebContextFrontmatter {
  url?: string;
  verdict?: Verdict;
  relevance?: number;
  source_host?: string;
  related_incident_id?: string;
  confidence?: number;
  reasoning?: string;
}

interface PageRow {
  id: number;
  title: string;
  compiled_truth: string;
  frontmatter: WebContextFrontmatter | null;
  created_at: string;
}

interface IncidentRow {
  id: string;
  title: string;
  severity: "low" | "med" | "high" | null;
}

export default async function EnrichmentPage() {
  const supabase = await createClient();

  const { data: pages, error } = await supabase
    .from("pages")
    .select("id, title, compiled_truth, frontmatter, created_at")
    .eq("source_id", "watchdog")
    .eq("type", "web_context")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <section className="p-6">
        <h1 className="font-mono text-sm uppercase tracking-widest">Web Search</h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Failed to load: {error.message}
        </p>
      </section>
    );
  }

  const pageRows = (pages ?? []) as PageRow[];

  const incidentIds = Array.from(
    new Set(
      pageRows
        .map((r) => r.frontmatter?.related_incident_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const incidentMeta = new Map<
    string,
    { title: string; severity: "low" | "med" | "high" | null }
  >();
  if (incidentIds.length > 0) {
    const { data: incRows } = await supabase
      .from("incidents")
      .select("id, title, severity")
      .in("id", incidentIds);
    for (const inc of (incRows ?? []) as IncidentRow[]) {
      incidentMeta.set(inc.id, { title: inc.title, severity: inc.severity });
    }
  }

  const rows: WebSearchRow[] = pageRows.map((r) => {
    const fm = r.frontmatter ?? {};
    const verdict: Verdict =
      fm.verdict === "corroborate" || fm.verdict === "contradict"
        ? fm.verdict
        : "neutral";
    const incidentId = fm.related_incident_id ?? null;
    const meta = incidentId ? incidentMeta.get(incidentId) : undefined;
    return {
      id: r.id,
      title: r.title ?? "",
      compiledTruth: r.compiled_truth ?? "",
      createdAt: r.created_at,
      url: fm.url ?? null,
      sourceHost: fm.source_host ?? null,
      verdict,
      relevance: typeof fm.relevance === "number" ? fm.relevance : null,
      confidence: typeof fm.confidence === "number" ? fm.confidence : null,
      reasoning: fm.reasoning ?? null,
      incidentId,
      incidentTitle: meta?.title ?? null,
      incidentSeverity: meta?.severity ?? null,
    };
  });

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm uppercase tracking-widest">
            <span className="border-b-2 border-black pb-0.5">Web</span> Search
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            {rows.length} results
          </span>
        </div>
        <RunNowButton />
      </header>

      <WebSearchView rows={rows} />
    </section>
  );
}
