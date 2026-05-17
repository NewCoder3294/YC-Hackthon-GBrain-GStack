"use client";

import { useState, useTransition } from "react";
import { runEnrichmentNow, type RunNowResult } from "./actions";

export function RunNowButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RunNowResult | null>(null);

  function onClick() {
    setResult(null);
    start(async () => {
      const r = await runEnrichmentNow();
      setResult(r);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 border border-black bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Running…" : "Run enrichment"}
      </button>
      {result && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {result.ok
            ? `${result.enriched}/${result.candidates} enriched · ${result.inserted} rows inserted${result.errors.length ? ` · ${result.errors.length} error(s)` : ""}`
            : `error: ${result.message}`}
        </span>
      )}
    </div>
  );
}
