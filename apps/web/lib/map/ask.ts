import "server-only";
import { env } from "@/lib/env";
import type { MapFilter } from "./filter";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

// Source labels live_incidents publishes. Keep this in sync with
// instability.ts SOURCE_DISPLAY but lowercased so the model picks the
// raw ID.
const KNOWN_SOURCES = [
  "sfpd_cad",
  "sfpd_reports",
  "sf_311",
  "fire_ems",
  "511_traffic",
  "511_transit",
] as const;

// Whitelisted SF neighborhoods to keep the model from inventing names.
// Match the SF Find Neighborhoods schema used by SFPD CAD.
const KNOWN_NEIGHBORHOODS = [
  "Bayview Hunters Point",
  "Bernal Heights",
  "Castro/Upper Market",
  "Chinatown",
  "Excelsior",
  "Financial District/South Beach",
  "Glen Park",
  "Haight Ashbury",
  "Hayes Valley",
  "Inner Richmond",
  "Inner Sunset",
  "Japantown",
  "Lakeshore",
  "Marina",
  "Mission",
  "Mission Bay",
  "Nob Hill",
  "Noe Valley",
  "North Beach",
  "Oceanview/Merced/Ingleside",
  "Outer Mission",
  "Outer Richmond",
  "Pacific Heights",
  "Portola",
  "Potrero Hill",
  "Presidio",
  "Russian Hill",
  "Seacliff",
  "South of Market",
  "Sunset/Parkside",
  "Tenderloin",
  "Treasure Island",
  "Twin Peaks",
  "Visitacion Valley",
  "West of Twin Peaks",
  "Western Addition",
];

export type AskResult =
  | { ok: true; filter: MapFilter; rationale: string }
  | { ok: false; reason: "no_api_key" | "model_error" | "empty"; message: string };

function buildPrompt(question: string): string {
  return [
    "You translate plain-English questions from an SF police dispatcher",
    "into a structured MapFilter for the WatchDog OSINT map. The map",
    "reads from `live_incidents` — real DataSF/511 events.",
    "",
    "FILTER SHAPE (every field optional):",
    `  sources?: ${KNOWN_SOURCES.map((s) => `"${s}"`).join(" | ")}[]`,
    `  severities?: ("low" | "med" | "high")[]`,
    `  neighborhoods?: (subset of: ${KNOWN_NEIGHBORHOODS.map((n) => `"${n}"`).join(", ")})[]`,
    "  titleContains?: string[]   // case-insensitive substrings matched against incident title",
    '  since?: string             // ISO timestamp ("last hour" → now-1h, "this week" → now-7d)',
    "  until?: string             // ISO timestamp",
    "",
    `Current UTC: ${new Date().toISOString()}`,
    "",
    "RULES:",
    '- "this week" → since = now - 7 days. "today" → since = midnight UTC. "last hour" → since = now - 1h.',
    "- Only emit neighborhoods from the whitelist above. If the user says",
    '  "downtown", expand to the relevant whitelist entries (e.g. ',
    "  Tenderloin, South of Market, Financial District/South Beach).",
    '- "assaults" → titleContains: ["ASSAULT"]. "shootings" → ["SHOT", "SHOOT"].',
    '  "fires" → ["FIRE"]. "robberies" → ["ROBBERY", "STRONGARM"].',
    '  "burglaries" → ["BURGLARY"]. "thefts" → ["THEFT", "LARCENY"].',
    '  "homeless"/"transient" → ["TRANSIENT", "WELL BEING CHECK"].',
    "- If the question doesn't constrain a field, leave it OUT entirely.",
    "- Never invent neighborhoods or sources.",
    "",
    "QUESTION:",
    question,
    "",
    'Respond with JSON ONLY: {"filter": <MapFilter>, "rationale": "<one short sentence>"}',
    "No prose outside the JSON.",
  ].join("\n");
}

function parseFilter(text: string): { filter: MapFilter; rationale: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      filter?: MapFilter;
      rationale?: string;
    };
    if (!obj.filter || typeof obj.filter !== "object") return null;
    const f = obj.filter;
    const filter: MapFilter = {};
    if (Array.isArray(f.sources))
      filter.sources = f.sources.filter((s) =>
        (KNOWN_SOURCES as readonly string[]).includes(s),
      );
    if (Array.isArray(f.severities))
      filter.severities = f.severities.filter(
        (s): s is "low" | "med" | "high" =>
          s === "low" || s === "med" || s === "high",
      );
    if (Array.isArray(f.neighborhoods))
      filter.neighborhoods = f.neighborhoods.filter((n) =>
        KNOWN_NEIGHBORHOODS.includes(n),
      );
    if (Array.isArray(f.titleContains))
      filter.titleContains = f.titleContains
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    if (typeof f.since === "string" && !Number.isNaN(Date.parse(f.since)))
      filter.since = new Date(f.since).toISOString();
    if (typeof f.until === "string" && !Number.isNaN(Date.parse(f.until)))
      filter.until = new Date(f.until).toISOString();
    return { filter, rationale: (obj.rationale ?? "").slice(0, 240) };
  } catch {
    return null;
  }
}

export async function askMapFilter(question: string): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) return { ok: false, reason: "empty", message: "empty question" };
  if (!env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      reason: "no_api_key",
      message: "ANTHROPIC_API_KEY not configured",
    };
  }

  let text = "";
  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: buildPrompt(trimmed) }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        reason: "model_error",
        message: `claude ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    text = (json.content?.[0]?.text ?? "").trim();
  } catch (err) {
    return {
      ok: false,
      reason: "model_error",
      message: err instanceof Error ? err.message : "fetch failed",
    };
  }

  const parsed = parseFilter(text);
  if (!parsed) {
    return {
      ok: false,
      reason: "model_error",
      message: "model response did not parse as MapFilter",
    };
  }
  return { ok: true, filter: parsed.filter, rationale: parsed.rationale };
}
