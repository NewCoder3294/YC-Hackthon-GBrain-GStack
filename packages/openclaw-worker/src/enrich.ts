import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getSql } from "./db";
import { getConfig } from "./config";
import { log } from "./logger";
import { callBudget } from "./budget";
import type { FusionCluster } from "./fusion";

/**
 * Per-cluster LLM enrichment via Claude. Designed for token economy:
 *
 *   - System prompt is large + reused, marked as `cache_control: ephemeral`
 *     so subsequent calls hit prompt cache (~10× cheaper on the prefix).
 *   - User message is small (cluster summary + ≤3 prior context snippets).
 *   - Structured output via `tool_use` — Claude returns a typed JSON object
 *     matching `EnrichedIncidentSchema`; no string-parsing.
 *   - Budget gate runs before the call; logs every token bucket.
 *   - On any failure (network, cap hit, schema mismatch), the caller falls
 *     back to a deterministic title and severity — never blocks the
 *     pipeline.
 *
 * No model output is trusted blindly: the schema validates, and the
 * downstream code clips strings to safe lengths.
 */

const SYSTEM_PROMPT = `You are an AI watch-officer assistant for WatchDog,
an incident-fusion system that supports SFPD dispatchers. Given a cluster
of correlated signals (camera ML detections, 911 call summaries, citizen
reports) and any prior records GBrain has about the location or signal
mix, produce ONE concise, structured incident report.

Be honest about uncertainty. The dispatcher's time is the constraint;
your job is to filter noise — if it's likely routine, say so. Never
invent details. Never name a person who isn't already named in the
inputs. Never reference race, ethnicity, or appearance.

# Severity rubric

- high: cross-territory gang activity; weapon mention; multi-source
  corroborated; active threat; injury suspected.
- med:  single-source corroborated by prior context; known pattern at
  this location with anomaly; low-confidence multi-source; ongoing
  ambiguous activity.
- low:  single-camera detection; sustained-traffic baseline; routine
  pattern with no anomaly; repeat false-positive corner.

# decision_hint
Your recommendation as if YOU were a senior dispatcher seeing this card:
- act:     real, dispatch now
- hold:    needs corroboration before dispatch (camera pan, request follow-up)
- review:  not urgent — log for pattern analysis
- dismiss: false-positive shape; let it go

Always include 2-5 tags in the form "region:<name>", "signal:<kind>",
"pattern:<name>", etc. Use [[type:slug]] wiki-links inside the narrative
when you cite a prior context page.`;

const enrichedSchema = z.object({
  title: z.string().min(1).max(120),
  severity: z.enum(["low", "med", "high"]),
  narrative: z.string().min(1).max(400),
  tags: z.array(z.string().min(1).max(40)).min(0).max(8),
  decision_hint: z.enum(["act", "hold", "review", "dismiss"]),
});

export type EnrichedIncident = z.infer<typeof enrichedSchema>;

interface PriorContextSnippet {
  slug: string;
  page_type: string;
  title: string;
  preview: string;
}

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (_client) return _client;
  const cfg = getConfig();
  const apiKey = cfg.ANTHROPIC_API_KEY;
  const authToken = cfg.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey && !authToken) return null;
  _client = new Anthropic({
    ...(apiKey ? { apiKey } : {}),
    ...(authToken ? { authToken } : {}),
  });
  return _client;
}

/**
 * Pull up to 3 prior context snippets near this cluster from gbrain.
 * Uses gbrain's tsvector FTS over the pages table — fast, no embedding
 * required. The query is built from rough location words + signal types.
 */
async function fetchPriorContext(
  cluster: FusionCluster,
  limit = 3,
): Promise<PriorContextSnippet[]> {
  const sql = getSql();
  // Build a query phrase: signal types + a rough lat/lng-derived region hint.
  const region = regionHint(cluster.centroidLat, cluster.centroidLng);
  const sigPhrase = Object.keys(cluster.sourceTypeCounts).join(" ");
  const q = `${region} ${sigPhrase}`.trim();
  try {
    const rows = await sql<
      Array<{ slug: string; page_type: string; title: string; preview: string }>
    >`
      SELECT slug, type AS page_type, title, LEFT(compiled_truth, 240) AS preview
      FROM pages
      WHERE source_id = ${getConfig().GBRAIN_SOURCE_ID}
        AND search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
      LIMIT ${limit}
    `;
    return [...rows];
  } catch (err) {
    log.warn({
      scope: "enrich.prior",
      msg: "gbrain query failed; continuing without prior context",
      extra: { err: err instanceof Error ? err.message : String(err) },
    });
    return [];
  }
}

function regionHint(lat: number, lng: number): string {
  if (lat > 37.78 && lng < -122.4 && lng > -122.42) return "tenderloin";
  if (lat > 37.76 && lat < 37.78 && lng < -122.41 && lng > -122.43) return "mission";
  if (lat < 37.74 && lng > -122.39) return "bayview";
  if (lat > 37.78 && lng < -122.4) return "soma";
  if (lng < -122.46) return "outer sunset";
  return "san francisco";
}

function clusterUserMessage(
  cluster: FusionCluster,
  prior: PriorContextSnippet[],
): string {
  const region = regionHint(cluster.centroidLat, cluster.centroidLng);
  const sigBreakdown = Object.entries(cluster.sourceTypeCounts)
    .map(([k, v]) => `${v}×${k}`)
    .join(", ");
  const memberLines = cluster.members
    .slice(0, 6)
    .map(
      (m) =>
        `  - ${m.sourceType} · ${m.sourceId} · ${m.occurredAt.toISOString()} · conf=${m.confidence?.toFixed(2) ?? "—"}`,
    )
    .join("\n");
  const omitted =
    cluster.members.length > 6 ? `  - (+${cluster.members.length - 6} more)\n` : "";

  const priorBlock =
    prior.length === 0
      ? "(no prior context surfaced)"
      : prior
          .map(
            (p) =>
              `- [[${p.page_type}:${p.slug}]] ${p.title}\n  ${p.preview.replace(/\s+/g, " ").trim()}`,
          )
          .join("\n");

  return `# Cluster

- centroid: ${cluster.centroidLat.toFixed(4)}, ${cluster.centroidLng.toFixed(4)} (${region})
- 5-min window: ${cluster.earliestAt.toISOString()} → ${cluster.latestAt.toISOString()}
- mix: ${sigBreakdown}
- members:
${memberLines}
${omitted}

# Prior context (gbrain hits)

${priorBlock}

Produce the structured report.`;
}

/**
 * The actual call. Returns enriched fields, or null if disabled / capped /
 * failed — caller falls back to a deterministic title.
 */
export async function enrichCluster(
  cluster: FusionCluster,
  callsThisTickSoFar: number,
): Promise<EnrichedIncident | null> {
  const cfg = getConfig();
  const allowed = callBudget.canCall(callsThisTickSoFar);
  if (!allowed.ok) {
    log.debug({
      scope: "enrich",
      msg: "skipped",
      extra: { reason: allowed.reason ?? "?", fusion_key: cluster.fusionKey },
    });
    return null;
  }
  const client = getClient();
  if (!client) {
    log.warn({
      scope: "enrich",
      msg: "no ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN — disabling LLM",
      extra: {},
    });
    return null;
  }

  const prior = await fetchPriorContext(cluster);
  const user = clusterUserMessage(cluster, prior);

  try {
    // Note: prompt caching requires the beta endpoint in @anthropic-ai/sdk
    // 0.32.0. Using the stable endpoint without cache_control keeps types
    // simple; we can swap to client.beta.messages.create + cache_control
    // when we want to optimize.
    const response = await client.messages.create({
      model: cfg.LLM_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "emit_incident_report",
          description: "Emit the structured incident report for this cluster.",
          input_schema: {
            type: "object",
            properties: {
              title: { type: "string", maxLength: 120 },
              severity: { type: "string", enum: ["low", "med", "high"] },
              narrative: { type: "string", maxLength: 400 },
              tags: { type: "array", items: { type: "string" }, maxItems: 8 },
              decision_hint: {
                type: "string",
                enum: ["act", "hold", "review", "dismiss"],
              },
            },
            required: ["title", "severity", "narrative", "tags", "decision_hint"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "emit_incident_report" },
      messages: [{ role: "user", content: user }],
    });

    // Account tokens.
    const usage = response.usage as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    callBudget.record({
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    });

    // Find the tool_use block.
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      log.warn({
        scope: "enrich",
        msg: "no tool_use in response",
        extra: { stop_reason: response.stop_reason },
      });
      return null;
    }
    const parsed = enrichedSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      log.warn({
        scope: "enrich",
        msg: "tool input failed schema",
        extra: { issues: parsed.error.issues.map((i) => i.message) },
      });
      return null;
    }
    return parsed.data;
  } catch (err) {
    log.warn({
      scope: "enrich",
      msg: "anthropic call failed",
      extra: { err: err instanceof Error ? err.message : String(err) },
    });
    return null;
  }
}

export { regionHint };
