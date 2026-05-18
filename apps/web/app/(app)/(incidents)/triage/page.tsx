import { after } from "next/server";
import { createDb } from "@caltrans/db";
import {
  runCorrelation,
  createAdjudicator,
  createLogger,
} from "@caltrans/ingestion";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  rankIncidentPages,
  type IncidentPageRow,
} from "@/lib/incidents/ranked";
import { TriageQueue } from "@/components/triage/triage-queue";

// Ranked dispatch queue, backed by the correlator's GBrain incident
// pages. The client component re-polls /api/incidents/ranked so the
// queue re-ranks live as the correlator worker runs.
export const dynamic = "force-dynamic";
// Allow the background `after()` callback enough time to finish a full
// correlation pass (reads ~365d baseline + ~48h live window). Mirrors the
// cron's maxDuration. Without this, Vercel kills the after() task at the
// default ~60s page timeout.
export const maxDuration = 300;

// If the most-recent incident page is older than this, kick correlation in
// the background on page load so triage is never stale beyond a minute. The
// cron at /api/cron/correlate is the durable path; this just covers gaps
// between cron ticks and the cold-start case.
const STALE_AFTER_MS = 60_000;

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

  const latestUpdatedAt = initial[0]?.updatedAt
    ? new Date(initial[0].updatedAt).getTime()
    : 0;
  const stale = !latestUpdatedAt || Date.now() - latestUpdatedAt > STALE_AFTER_MS;

  if (stale && env.DATABASE_URL) {
    const databaseUrl = env.DATABASE_URL;
    after(async () => {
      try {
        const db = createDb(databaseUrl);
        await runCorrelation({
          db,
          now: new Date(),
          adjudicator: createAdjudicator({}),
          logger: createLogger("triage.page"),
        });
      } catch {
        // Best-effort — cron is the durable path. The client poll will
        // pick up results on the next tick once correlation completes.
      }
    });
  }

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
      <TriageQueue initial={initial} kickedBackground={stale} />
    </div>
  );
}
