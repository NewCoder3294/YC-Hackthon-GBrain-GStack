import type { SearchHit } from "./types";

interface FirecrawlSearchOptions {
  query: string;
  limit?: number;
  apiKey: string;
  scrape?: boolean;
}

interface FirecrawlResponse {
  success: boolean;
  data?: {
    web?: Array<{
      title?: string;
      description?: string;
      url?: string;
      markdown?: string;
    }>;
  };
  warning?: string | null;
}

const ENDPOINT = "https://api.firecrawl.dev/v2/search";

export async function firecrawlSearch({
  query,
  limit = 10,
  apiKey,
  scrape = false,
}: FirecrawlSearchOptions): Promise<SearchHit[]> {
  const body: Record<string, unknown> = {
    query,
    limit,
    sources: [{ type: "web" }],
    country: "US",
  };
  if (scrape) {
    body.scrapeOptions = { formats: [{ type: "markdown" }] };
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`firecrawl ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as FirecrawlResponse;
  if (!json.success || !json.data?.web) return [];

  return json.data.web
    .filter((r) => r.url && r.title)
    .map((r) => ({
      title: r.title ?? "",
      description: r.description ?? "",
      url: r.url ?? "",
      markdown: r.markdown ?? null,
    }));
}
