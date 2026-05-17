import type { RankedHit, SearchHit } from "./types";

interface RerankOptions {
  query: string;
  hits: SearchHit[];
  apiKey: string;
  topN?: number;
  model?: string;
}

interface ZeRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

const ENDPOINT = "https://api.zeroentropy.dev/v1/models/rerank";

export async function zerankHits({
  query,
  hits,
  apiKey,
  topN = 3,
  model = "zerank-2",
}: RerankOptions): Promise<RankedHit[]> {
  if (hits.length === 0) return [];

  const documents = hits.map((h) =>
    [h.title, h.description, h.markdown ?? ""].filter(Boolean).join("\n").slice(0, 4000),
  );

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, query, documents }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`zeroentropy ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as ZeRerankResponse;
  return json.results
    .slice(0, topN)
    .map((r) => ({ ...hits[r.index]!, relevance: r.relevance_score }))
    .filter((r) => r.url);
}
