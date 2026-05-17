import { createClient } from "@/lib/supabase/server";
import {
  rankIncidentPages,
  type IncidentPageRow,
} from "@/lib/incidents/ranked";
import { TriageQueue } from "@/components/triage/triage-queue";

// Ranked dispatch queue, backed by the correlator's GBrain incident
// pages. The client component re-polls /api/incidents/ranked so the
// queue re-ranks live as the correlator worker runs.
export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pages")
    .select(
      "id, slug, type, title, compiled_truth, frontmatter, updated_at, tags ( tag )",
    )
    .eq("source_id", "watchdog")
    .eq("type", "incident")
    .order("updated_at", { ascending: false })
    .limit(100);

  const initial = rankIncidentPages(
    (data ?? []) as unknown as IncidentPageRow[],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-mono text-sm font-semibold uppercase tracking-[0.2em]">
          Dispatch Triage
        </h1>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          Correlated · ranked · {initial.length} active
        </span>
      </div>
      <TriageQueue initial={initial} />
    </div>
  );
}
