import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  rankIncidentPages,
  type IncidentPageRow,
} from "@/lib/incidents/ranked";
import {
  RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
  withRateLimitHeaders,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ranked dispatch queue: the correlator's `type='incident'` GBrain
 * pages, mapped + sorted highest-priority first. Consumed by /triage.
 */
export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(request, {
    ...RATE_LIMITS.livePoll,
    keyPrefix: "api:incidents-ranked",
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pages")
      .select(
        "id, slug, type, title, compiled_truth, frontmatter, updated_at, tags ( tag )",
      )
      .eq("source_id", "watchdog")
      .eq("type", "incident")
      // Correlator slugs are `incident-<hash>`; this keeps pre-existing
      // seed/placeholder incident pages out of the dispatch queue.
      .like("slug", "incident-%")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    const incidents = rankIncidentPages(
      (data ?? []) as unknown as IncidentPageRow[],
    );
    return withRateLimitHeaders(
      NextResponse.json({ success: true, data: incidents }),
      rate,
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "ranked query failed",
      },
      { status: 500 },
    );
  }
}
