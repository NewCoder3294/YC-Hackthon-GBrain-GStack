"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { askMap } from "@/app/(app)/map/actions";
import { decodeFilter, describeFilter, isFilterEmpty } from "@/lib/map/filter";

const SUGGESTIONS = [
  "assaults in Tenderloin this week",
  "everything in Mission last 6 hours",
  "shootings citywide last 24h",
  "high-severity incidents in SoMa today",
];

interface Props {
  /** Server-computed count of incidents matching the current URL filter.
   *  When the filter is empty this is 0 by convention. */
  matchCount: number;
}

export function MapAskBar({ matchCount }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [question, setQuestion] = useState("");
  const [rationale, setRationale] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filter = decodeFilter(params);
  const chips = describeFilter(filter);
  const hasFilter = !isFilterEmpty(filter);

  function applyQuery(query: string) {
    const next = query ? `?${query}` : "";
    router.replace(`/map${next}` as Route);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setError(null);
    setRationale(null);
    startTransition(async () => {
      const res = await askMap({ question });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRationale(res.rationale);
      applyQuery(res.query);
    });
  }

  function clearFilter() {
    setQuestion("");
    setRationale(null);
    setError(null);
    applyQuery("");
  }

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[min(420px,calc(100vw-1.5rem))] space-y-1.5">
      {(hasFilter || rationale || error) && (
        <div className="flex flex-wrap items-center gap-1.5 border border-neutral-300 bg-white/95 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-600 backdrop-blur">
          {chips.map((c) => (
            <span key={c} className="border border-neutral-300 px-1.5 py-0.5">
              {c}
            </span>
          ))}
          {hasFilter && (
            <span className="border border-black bg-black px-1.5 py-0.5 text-white">
              {matchCount} match{matchCount === 1 ? "" : "es"}
            </span>
          )}
          {rationale && (
            <span className="text-[10px] normal-case tracking-normal text-neutral-500">
              · {rationale}
            </span>
          )}
          {error && (
            <span className="text-[10px] normal-case tracking-normal text-red-700">
              · {error}
            </span>
          )}
          {hasFilter && (
            <button
              type="button"
              onClick={clearFilter}
              className="ml-auto border border-neutral-300 px-1.5 py-0.5 hover:border-black hover:bg-black hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      )}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-1.5 border border-neutral-300 bg-white/95 px-2 py-1.5 backdrop-blur"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Ask
        </span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={SUGGESTIONS[0]}
          disabled={pending}
          className="min-w-0 flex-1 border-0 bg-transparent font-mono text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !question.trim()}
          className="border border-neutral-300 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest hover:border-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "…" : "Go"}
        </button>
      </form>
    </div>
  );
}
