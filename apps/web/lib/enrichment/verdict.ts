import type { IncidentContext, RankedHit, Verdict } from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

interface VerdictResult {
  verdict: Verdict;
  reasoning: string;
}

const VERDICTS: ReadonlySet<Verdict> = new Set([
  "corroborate",
  "neutral",
  "contradict",
]);

function buildPrompt(incident: IncidentContext, hit: RankedHit): string {
  return [
    "You are a fact-checker classifying whether a web result corroborates a live traffic incident report.",
    "",
    "INCIDENT (official signal):",
    `  Title: ${incident.title}`,
    `  Severity: ${incident.severity}`,
    `  Time: ${incident.createdAt}`,
    incident.location ? `  Location: ${incident.location}` : "",
    "",
    "WEB RESULT (unofficial):",
    `  URL: ${hit.url}`,
    `  Title: ${hit.title}`,
    `  Snippet: ${hit.description}`,
    hit.markdown ? `  Excerpt: ${hit.markdown.slice(0, 800)}` : "",
    "",
    'Classify the web result as exactly one of: "corroborate", "neutral", or "contradict".',
    "- corroborate: independently confirms the same incident",
    "- neutral: relevant but neither confirms nor contradicts",
    "- contradict: states something that disagrees with the incident",
    "",
    'Respond with JSON ONLY: {"verdict": "<value>", "reasoning": "<one short sentence>"}',
  ]
    .filter(Boolean)
    .join("\n");
}

function parseVerdict(text: string): VerdictResult {
  const match = text.match(/\{[^{}]*"verdict"[^{}]*\}/);
  if (!match) return { verdict: "neutral", reasoning: "unparseable verdict response" };
  try {
    const obj = JSON.parse(match[0]) as { verdict?: string; reasoning?: string };
    const v = (obj.verdict ?? "").toLowerCase() as Verdict;
    if (!VERDICTS.has(v)) return { verdict: "neutral", reasoning: obj.reasoning ?? "" };
    return { verdict: v, reasoning: (obj.reasoning ?? "").slice(0, 240) };
  } catch {
    return { verdict: "neutral", reasoning: "json parse failed" };
  }
}

export async function classifyVerdict(
  incident: IncidentContext,
  hit: RankedHit,
  apiKey: string,
): Promise<VerdictResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      messages: [{ role: "user", content: buildPrompt(incident, hit) }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ text?: string }>;
  };
  const text = json.content?.[0]?.text ?? "";
  return parseVerdict(text);
}

const VERDICT_WEIGHT: Record<Verdict, number> = {
  corroborate: 1.0,
  neutral: 0.5,
  contradict: 0.25,
};

const UNOFFICIAL_CONFIDENCE_CEILING = 0.6;

export function computeConfidence(relevance: number, verdict: Verdict): number {
  const raw = relevance * VERDICT_WEIGHT[verdict];
  return Math.min(UNOFFICIAL_CONFIDENCE_CEILING, Math.max(0, raw));
}
