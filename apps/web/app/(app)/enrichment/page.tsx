import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RunNowButton } from "./run-button";

export const dynamic = "force-dynamic";

interface WebContextFrontmatter {
  url?: string;
  verdict?: "corroborate" | "neutral" | "contradict";
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
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function EnrichmentPage() {
  const supabase = await createClient();

  const { data: pages, error } = await supabase
    .from("pages")
    .select("id, title, compiled_truth, frontmatter, created_at")
    .eq("source_id", "watchdog")
    .eq("type", "web_context")
    .order("created_at", { ascending: false })
    .limit(100);

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

  const rows = (pages ?? []) as PageRow[];

  // Resolve incident titles for the related_incident_ids we found.
  const incidentIds = Array.from(
    new Set(
      rows
        .map((r) => r.frontmatter?.related_incident_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  let incidentTitles = new Map<string, string>();
  if (incidentIds.length > 0) {
    const { data: incRows } = await supabase
      .from("incidents")
      .select("id, title")
      .in("id", incidentIds);
    incidentTitles = new Map(
      ((incRows ?? []) as IncidentRow[]).map((i) => [i.id, i.title]),
    );
  }

  const verdictCounts = { corroborate: 0, neutral: 0, contradict: 0 };
  let confidenceSum = 0;
  let confidenceN = 0;
  const hosts = new Set<string>();
  for (const r of rows) {
    const fm = r.frontmatter ?? {};
    if (fm.verdict && fm.verdict in verdictCounts) {
      verdictCounts[fm.verdict]++;
    }
    if (typeof fm.confidence === "number") {
      confidenceSum += fm.confidence;
      confidenceN++;
    }
    if (fm.source_host) hosts.add(fm.source_host);
  }
  const avgConfidence = confidenceN ? confidenceSum / confidenceN : 0;
  const lastRun = rows[0]?.created_at ?? null;
  const incidentsCovered = new Set(
    rows
      .map((r) => r.frontmatter?.related_incident_id)
      .filter((x): x is string => typeof x === "string"),
  ).size;

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm uppercase tracking-widest">Web Search</h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            {rows.length} results
          </span>
        </div>
        <RunNowButton />
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-neutral-200 bg-neutral-200 lg:grid-cols-5">
        <Stat label="Total enriched results" value={rows.length.toString()} />
        <Stat label="Incidents covered" value={incidentsCovered.toString()} />
        <Stat
          label="Verdict mix"
          value={`${verdictCounts.corroborate} / ${verdictCounts.neutral} / ${verdictCounts.contradict}`}
          sub="corroborate / neutral / contradict"
        />
        <Stat
          label="Avg confidence"
          value={confidenceN ? avgConfidence.toFixed(2) : "—"}
        />
        <Stat
          label="Last enrichment"
          value={lastRun ? formatTimestamp(lastRun) : "—"}
          sub={`${hosts.size} unique source${hosts.size === 1 ? "" : "s"}`}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-widest text-neutral-400">
              <th className="px-4 py-2 font-normal">Found</th>
              <th className="px-4 py-2 font-normal">Source</th>
              <th className="px-4 py-2 font-normal">Title</th>
              <th className="px-4 py-2 font-normal">Verdict</th>
              <th className="px-4 py-2 font-normal text-right">Relevance</th>
              <th className="px-4 py-2 font-normal text-right">Confidence</th>
              <th className="px-4 py-2 font-normal">Incident</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-neutral-400"
                >
                  No web context yet. Click "Run enrichment" above to start.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const fm = r.frontmatter ?? {};
              const verdict = fm.verdict ?? "neutral";
              const incidentTitle = fm.related_incident_id
                ? incidentTitles.get(fm.related_incident_id)
                : undefined;
              return (
                <tr key={r.id} className="border-b border-neutral-100 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-neutral-500">
                    {formatTimestamp(r.created_at)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-neutral-500">
                    {fm.source_host ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {fm.url ? (
                      <a
                        href={fm.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-black hover:underline"
                      >
                        {r.title || fm.url}
                      </a>
                    ) : (
                      <span>{r.title || "—"}</span>
                    )}
                    {r.compiled_truth && (
                      <p className="mt-0.5 line-clamp-2 text-neutral-500">
                        {r.compiled_truth}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <VerdictPill verdict={verdict} />
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-700">
                    {typeof fm.relevance === "number"
                      ? fm.relevance.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-700">
                    {typeof fm.confidence === "number"
                      ? fm.confidence.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {fm.related_incident_id ? (
                      <Link
                        href={`/incidents/${fm.related_incident_id}`}
                        className="hover:text-black hover:underline"
                      >
                        {incidentTitle ?? fm.related_incident_id.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
      <div className="mt-1 font-mono text-lg">{value}</div>
      {sub && (
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {sub}
        </div>
      )}
    </div>
  );
}

function VerdictPill({ verdict }: { verdict: string }) {
  const style =
    verdict === "corroborate"
      ? "bg-black text-white"
      : verdict === "contradict"
        ? "border border-black bg-white text-black line-through decoration-black"
        : "border border-neutral-300 bg-white text-neutral-600";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${style}`}
    >
      {verdict}
    </span>
  );
}
