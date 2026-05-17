import { firecrawlSearch } from "./firecrawl";
import { zerankHits } from "./zeroentropy";
import { classifyVerdict, computeConfidence } from "./verdict";
import type { EnrichedHit, IncidentContext } from "./types";

export interface EnrichmentKeys {
  firecrawl: string;
  zeroentropy: string;
  anthropic: string;
}

export interface EnrichmentOptions {
  searchLimit?: number;
  topN?: number;
}

export function buildQuery(incident: IncidentContext): string {
  const parts = [incident.title];
  if (incident.location) parts.push(incident.location);
  parts.push("traffic incident");
  return parts.join(" ");
}

export async function enrichIncident(
  incident: IncidentContext,
  keys: EnrichmentKeys,
  opts: EnrichmentOptions = {},
): Promise<EnrichedHit[]> {
  const query = buildQuery(incident);

  const hits = await firecrawlSearch({
    query,
    limit: opts.searchLimit ?? 15,
    apiKey: keys.firecrawl,
    scrape: false,
  });
  if (hits.length === 0) return [];

  const ranked = await zerankHits({
    query,
    hits,
    apiKey: keys.zeroentropy,
    topN: opts.topN ?? 3,
  });
  if (ranked.length === 0) return [];

  const enriched = await Promise.all(
    ranked.map(async (hit) => {
      try {
        const { verdict, reasoning } = await classifyVerdict(
          incident,
          hit,
          keys.anthropic,
        );
        return {
          ...hit,
          verdict,
          reasoning,
          confidence: computeConfidence(hit.relevance, verdict),
        };
      } catch (err) {
        return {
          ...hit,
          verdict: "neutral" as const,
          reasoning: err instanceof Error ? err.message.slice(0, 200) : "verdict failed",
          confidence: computeConfidence(hit.relevance, "neutral"),
        };
      }
    }),
  );

  return enriched;
}
