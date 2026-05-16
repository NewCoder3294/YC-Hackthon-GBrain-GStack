/**
 * 911 transcript summarizer (TRD §6).
 *
 * Turns a raw call transcript into a tight, operator-readable one-liner
 * plus extracted keywords. Uses Anthropic's cheapest/fastest model
 * (Haiku) by default because summarization runs on every call and the
 * task is shallow — Opus-class reasoning is wasted here.
 *
 * Resilience is non-negotiable for a live demo: if there is no API key,
 * or the API errors / times out / returns junk, we MUST degrade to a
 * deterministic local fallback and keep the pipeline flowing. The
 * correlator can still act on the keywords + raw transcript.
 *
 * The Anthropic client is dependency-injected so unit tests can simulate
 * "no key", "throws", and "happy path" without any network access.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createLogger, type Logger } from "../logger";

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Minimal structural view of the Anthropic Messages API we depend on. */
export interface AnthropicLike {
  messages: {
    create(body: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: ReadonlyArray<{ role: "user"; content: string }>;
    }): Promise<{
      content: ReadonlyArray<{ type: string; text?: string }>;
    }>;
  };
}

export interface SummarizeDeps {
  /** Injected client. If omitted, one is built from env (or fallback used). */
  client?: AnthropicLike | undefined;
  /** Override model; defaults to env ANTHROPIC_MODEL then DEFAULT_MODEL. */
  model?: string | undefined;
  /** Injected logger for testability. */
  logger?: Logger | undefined;
  /** Override the API key lookup (tests). Defaults to ANTHROPIC_API_KEY. */
  apiKey?: string | undefined;
}

export interface TranscriptSummary {
  /** One-line operator summary. */
  summary: string;
  /** Lowercased, de-duplicated keywords pulled from the transcript. */
  keywords: string[];
  /** Whether the summary came from the model (false = local fallback). */
  fromModel: boolean;
}

const FALLBACK_CHARS = 120;

const KEYWORD_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/shots?\s+fired|gunfire|gunshot/i, "shots fired"],
  [/\bgun\b|firearm|armed|weapon|waistband/i, "weapon"],
  [/\bknife\b|stabb/i, "knife"],
  [/robb|mugg|stole|took my/i, "robbery"],
  [/\bfight|assault|brawl|jumped\b/i, "assault"],
  [/sedan|vehicle|car\s+(?:sped|fled)|drove off|sped off/i, "vehicle"],
  [/gang|crew|crews/i, "gang"],
  [/ambulance|medic|bleeding|blood|not moving|unconscious/i, "medical"],
  [/false alarm|cancel|nothing|firecracker|kids\?/i, "ambiguous"],
];

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

/** Deterministic, no-network keyword extraction. */
export function extractKeywords(transcript: string): string[] {
  const found = new Set<string>();
  for (const [pattern, label] of KEYWORD_PATTERNS) {
    if (pattern.test(transcript)) found.add(label);
  }
  return [...found];
}

/** Deterministic fallback used whenever the model path is unavailable. */
export function fallbackSummary(transcript: string): TranscriptSummary {
  return {
    summary: clip(transcript, FALLBACK_CHARS),
    keywords: extractKeywords(transcript),
    fromModel: false,
  };
}

const SYSTEM_PROMPT =
  "You are a 911 dispatch analyst. Given a raw emergency call transcript, " +
  "reply with ONE concise sentence (max 30 words) stating what is " +
  "happening, the location if mentioned, and any threat. No preamble, no " +
  "quotes, no markdown.";

function resolveModel(deps: SummarizeDeps): string {
  const fromDeps = deps.model;
  if (fromDeps && fromDeps.length > 0) return fromDeps;
  const fromEnv = process.env.ANTHROPIC_MODEL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return DEFAULT_MODEL;
}

function resolveApiKey(deps: SummarizeDeps): string | undefined {
  if (deps.apiKey !== undefined) {
    return deps.apiKey.length > 0 ? deps.apiKey : undefined;
  }
  const env = process.env.ANTHROPIC_API_KEY;
  return env && env.length > 0 ? env : undefined;
}

function firstText(
  blocks: ReadonlyArray<{ type: string; text?: string }>,
): string | undefined {
  for (const b of blocks) {
    if (b.type === "text" && typeof b.text === "string") {
      const t = b.text.trim();
      if (t.length > 0) return t;
    }
  }
  return undefined;
}

/**
 * Summarize a transcript. NEVER throws: any failure path returns the
 * deterministic fallback and logs a warn so the pipeline keeps running.
 */
export async function summarizeTranscript(
  transcript: string,
  deps: SummarizeDeps = {},
): Promise<TranscriptSummary> {
  const log = deps.logger ?? createLogger("calls.summarize");
  const keywords = extractKeywords(transcript);

  const apiKey = resolveApiKey(deps);
  let client = deps.client;

  if (!client) {
    if (apiKey === undefined) {
      log.warn("ANTHROPIC_API_KEY absent — using deterministic fallback");
      return fallbackSummary(transcript);
    }
    client = new Anthropic({ apiKey }) as unknown as AnthropicLike;
  }

  const model = resolveModel(deps);

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 120,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });
    const text = firstText(res.content);
    if (text === undefined) {
      log.warn("Model returned no text block — using fallback", { model });
      return fallbackSummary(transcript);
    }
    return { summary: clip(text, 280), keywords, fromModel: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Summarization failed — using fallback", { model, message });
    return fallbackSummary(transcript);
  }
}
