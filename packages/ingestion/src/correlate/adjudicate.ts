/**
 * The single LLM boundary. Mirrors calls/summarize.ts exactly: a
 * dependency-injected Anthropic client, env-resolved key/model, and a
 * deterministic fallback that is used whenever the model path is
 * unavailable. NEVER throws — the pipeline must not block on the LLM.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createLogger, type Logger } from "../logger";
import { AMBIGUOUS_RADIUS_FACTOR, RADIUS_M } from "./config";
import type { AmbiguousMerge, ScoreFactors, Tier } from "./types";

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Minimal structural view of the Anthropic Messages API we depend on. */
export interface AnthropicLike {
  messages: {
    create(body: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: ReadonlyArray<{ role: "user"; content: string }>;
    }): Promise<{ content: ReadonlyArray<{ type: string; text?: string }> }>;
  };
}

export interface AmbiguousContext {
  signalAffinity: string;
  clusterAffinity: string;
  neighborhood: string;
}

export interface NarrateInput {
  tier: Tier;
  factors: ScoreFactors;
  sourceCount: number;
  neighborhood: string;
  affinityGroup: string;
  anomalyRatio: number; // cluster category count / baseline expectation
}

export interface Adjudicator {
  resolveAmbiguous(
    merge: AmbiguousMerge,
    ctx: AmbiguousContext,
  ): Promise<"merge" | "split">;
  narrate(input: NarrateInput): Promise<string>;
}

export interface AdjudicatorDeps {
  client?: AnthropicLike | undefined;
  model?: string | undefined;
  logger?: Logger | undefined;
  apiKey?: string | undefined;
}

function resolveModel(deps: AdjudicatorDeps): string {
  if (deps.model && deps.model.length > 0) return deps.model;
  const env = process.env.ANTHROPIC_MODEL;
  return env && env.length > 0 ? env : DEFAULT_MODEL;
}

function resolveApiKey(deps: AdjudicatorDeps): string | undefined {
  if (deps.apiKey !== undefined)
    return deps.apiKey.length > 0 ? deps.apiKey : undefined;
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

/** Deterministic decisions, used directly and as the fallback. */
export function deterministicResolve(merge: AmbiguousMerge): "merge" | "split" {
  return merge.reason === "category-match-near-radius" &&
    merge.distanceM <= AMBIGUOUS_RADIUS_FACTOR * RADIUS_M
    ? "merge"
    : "split";
}

export function deterministicNarrate(input: NarrateInput): string {
  const x = input.anomalyRatio.toFixed(1);
  return (
    `${input.tier}: ${input.sourceCount} source(s), ${input.affinityGroup}, ` +
    `${x}× baseline in ${input.neighborhood}` +
    (input.factors.degraded ? " (degraded — no baseline)" : "") +
    "."
  );
}

export const deterministicAdjudicator: Adjudicator = {
  resolveAmbiguous: (merge) => Promise.resolve(deterministicResolve(merge)),
  narrate: (input) => Promise.resolve(deterministicNarrate(input)),
};

const RESOLVE_SYSTEM =
  "You are a dispatch correlation analyst. Decide if a borderline signal " +
  "belongs to the SAME real-world incident as a nearby cluster. Reply with " +
  "exactly one word: MERGE or SPLIT. No punctuation, no explanation.";

const NARRATE_SYSTEM =
  "You are a dispatch analyst. Given an incident's factor breakdown and " +
  "neighborhood context, write ONE sentence (max 35 words) explaining why " +
  "it has this dispatch rank. No preamble, no quotes, no markdown.";

export function createAdjudicator(deps: AdjudicatorDeps = {}): Adjudicator {
  const log = deps.logger ?? createLogger("correlate.adjudicate");
  const apiKey = resolveApiKey(deps);
  let client = deps.client;

  if (!client) {
    if (apiKey === undefined) {
      log.warn("ANTHROPIC_API_KEY absent — deterministic adjudicator");
      return deterministicAdjudicator;
    }
    client = new Anthropic({ apiKey }) as unknown as AnthropicLike;
  }
  const model = resolveModel(deps);

  return {
    async resolveAmbiguous(merge, ctx) {
      try {
        const res = await client!.messages.create({
          model,
          max_tokens: 8,
          system: RESOLVE_SYSTEM,
          messages: [
            {
              role: "user",
              content:
                `Signal category group: ${ctx.signalAffinity}. ` +
                `Cluster category group: ${ctx.clusterAffinity}. ` +
                `Distance: ${merge.distanceM} m. Reason: ${merge.reason}. ` +
                `Same neighborhood: ${ctx.neighborhood}.`,
            },
          ],
        });
        const t = (firstText(res.content) ?? "").toUpperCase();
        if (t.includes("MERGE")) return "merge";
        if (t.includes("SPLIT")) return "split";
        return deterministicResolve(merge);
      } catch (err: unknown) {
        log.warn("resolveAmbiguous failed — deterministic", {
          message: err instanceof Error ? err.message : String(err),
        });
        return deterministicResolve(merge);
      }
    },

    async narrate(input) {
      try {
        const res = await client!.messages.create({
          model,
          max_tokens: 90,
          system: NARRATE_SYSTEM,
          messages: [
            {
              role: "user",
              content:
                `Tier ${input.tier}. Sources: ${input.sourceCount}. ` +
                `Category: ${input.affinityGroup}. ` +
                `Neighborhood: ${input.neighborhood}. ` +
                `Anomaly vs baseline: ${input.anomalyRatio.toFixed(1)}x. ` +
                `Factors: corroboration ${input.factors.corroboration.toFixed(2)}, ` +
                `severity ${input.factors.severity.toFixed(2)}, ` +
                `anomaly ${input.factors.anomaly.toFixed(2)}, ` +
                `equity ${input.factors.equity.toFixed(2)}` +
                (input.factors.degraded ? " (no baseline context)" : "") +
                ".",
            },
          ],
        });
        const t = firstText(res.content);
        return t === undefined ? deterministicNarrate(input) : t;
      } catch (err: unknown) {
        log.warn("narrate failed — deterministic", {
          message: err instanceof Error ? err.message : String(err),
        });
        return deterministicNarrate(input);
      }
    },
  };
}
