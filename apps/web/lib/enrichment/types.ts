export type Verdict = "corroborate" | "neutral" | "contradict";

export interface SearchHit {
  title: string;
  description: string;
  url: string;
  markdown: string | null;
}

export interface RankedHit extends SearchHit {
  relevance: number;
}

export interface EnrichedHit extends RankedHit {
  verdict: Verdict;
  reasoning: string;
  confidence: number;
}

export interface IncidentContext {
  id: string;
  title: string;
  severity: "low" | "med" | "high";
  createdAt: string;
  location: string | null;
}
