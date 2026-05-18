import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const SF_BRIEF_CACHE_TAG = "sf-brief";

export interface SFBrief {
  /** One-paragraph synthesis of the last hour, ~50–80 words. */
  text: string;
  /** When the underlying signal window starts (ISO). */
  windowStart: string;
  /** How many live_incidents rows fed the synthesis. */
  rowsConsidered: number;
  /** Generated at (ISO). */
  generatedAt: string;
  /** Reason set when text is empty — "no_signal", "no_api_key", or "model_error". */
  reason?: "no_signal" | "no_api_key" | "model_error";
}

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

interface IncidentRow {
  source: string;
  title: string;
  severity: "low" | "med" | "high";
  neighborhood: string | null;
  occurred_at: string;
}

function buildPrompt(rows: IncidentRow[], windowStart: Date): string {
  const sortedRows = [...rows]
    .sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    )
    .slice(0, 80);
  const lines = sortedRows
    .map((r) => {
      const t = new Date(r.occurred_at).toISOString().slice(11, 16); // HH:MM UTC
      const nbhd = r.neighborhood?.trim() || "Unknown";
      return `  - ${t}Z [${r.severity.toUpperCase()}] ${r.source} · ${r.title} (${nbhd})`;
    })
    .join("\n");
  return [
    "You are writing the situational-awareness brief for an SF police dispatcher.",
    "You will receive a list of public-safety incidents from the last hour drawn from",
    "DataSF / 511 (SFPD CAD, SF 311, SFPD Reports, 511 Traffic).",
    "",
    `Window start: ${windowStart.toISOString()}`,
    "Incidents:",
    lines,
    "",
    "Write ONE paragraph, 50–80 words, plain text. No headings, no bullet lists, no markdown.",
    "Lead with the most consequential pattern (clusters by neighborhood, severity spikes,",
    "or repeat call types). End with a 'watch for' clause flagging the type/area most",
    "likely to escalate. Be precise, never speculate beyond the data, no filler.",
  ].join("\n");
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 320,
      messages: [{ role: "user", content: prompt }],
    }),
    // Hard timeout so a hung model call doesn't block the cockpit render.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ text?: string }>;
  };
  return (json.content?.[0]?.text ?? "").trim();
}

async function loadBrief(): Promise<SFBrief> {
  const windowStart = new Date(Date.now() - 60 * 60 * 1000);
  const generatedAt = new Date().toISOString();

  // Use service-role (falls back to anon) — unstable_cache can't read cookies,
  // and live_incidents has open SELECT RLS for anon anyway.
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("live_incidents")
    .select("source, title, severity, neighborhood, occurred_at")
    .gte("occurred_at", windowStart.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(150);

  if (error || !data || data.length === 0) {
    return {
      text: "",
      windowStart: windowStart.toISOString(),
      rowsConsidered: 0,
      generatedAt,
      reason: "no_signal",
    };
  }

  if (!env.ANTHROPIC_API_KEY) {
    return {
      text: "",
      windowStart: windowStart.toISOString(),
      rowsConsidered: data.length,
      generatedAt,
      reason: "no_api_key",
    };
  }

  try {
    const prompt = buildPrompt(data as IncidentRow[], windowStart);
    const text = await callClaude(prompt, env.ANTHROPIC_API_KEY);
    return {
      text,
      windowStart: windowStart.toISOString(),
      rowsConsidered: data.length,
      generatedAt,
    };
  } catch {
    return {
      text: "",
      windowStart: windowStart.toISOString(),
      rowsConsidered: data.length,
      generatedAt,
      reason: "model_error",
    };
  }
}

// 5 min cache; new data lands every ~15 min via the orchestrator so a
// shorter TTL just burns tokens without changing the brief.
export const loadSFBrief = unstable_cache(loadBrief, ["cockpit:sf-brief:v1"], {
  revalidate: 300,
  tags: [SF_BRIEF_CACHE_TAG],
});
