"use server";

import { z } from "zod";
import { askMapFilter } from "@/lib/map/ask";
import { encodeFilter, type MapFilter } from "@/lib/map/filter";

const schema = z.object({ question: z.string().min(1).max(400) });

export type AskMapResponse =
  | { ok: true; filter: MapFilter; rationale: string; query: string }
  | { ok: false; message: string };

/**
 * Server action wired to the map's natural-language input bar. Resolves
 * the question into a typed MapFilter via Claude and returns an
 * encoded URL query string the client should navigate to.
 */
export async function askMap(input: { question: string }): Promise<AskMapResponse> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "invalid question" };
  }
  const result = await askMapFilter(parsed.data.question);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  const params = encodeFilter(result.filter);
  return {
    ok: true,
    filter: result.filter,
    rationale: result.rationale,
    query: params.toString(),
  };
}
