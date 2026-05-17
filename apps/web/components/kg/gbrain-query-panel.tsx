"use client";

import { useState, useTransition } from "react";
import { searchGbrain, type GbrainSearchHit } from "@/app/(app)/kg/actions";
import { cn } from "@/lib/utils";

interface Props {
  onFocusGbrainId?: (id: string) => void;
}

const SUGGESTIONS = [
  "mission corridor drug crackdown",
  "tenderloin enforcement",
  "rival territory intrusion",
  "false-positive 911 hangup",
  "soma collisions",
];

export function GbrainQueryPanel({ onFocusGbrainId }: Props) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GbrainSearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(query: string) {
    const t = query.trim();
    if (!t) {
      setHits(null);
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await searchGbrain({ q: t, limit: 12 });
        setHits(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute right-4 top-[4.5rem] z-10 flex items-center gap-1.5 border border-neutral-300 bg-white px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-neutral-600 shadow-sm hover:border-black hover:text-black"
      >
        <span aria-hidden>?</span>
        Ask GBrain
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto absolute right-4 top-[4.5rem] z-10 flex h-[calc(100vh-6rem)] w-[32rem] flex-col border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <span className="font-mono text-xs uppercase tracking-widest text-neutral-700">
          Ask GBrain
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setHits(null);
            setQ("");
            setError(null);
          }}
          className="font-mono text-sm text-neutral-500 hover:text-black"
          aria-label="close"
        >
          ✕
        </button>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        className="border-b border-neutral-200 p-4"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="natural-language query…"
          autoFocus
          className="h-10 w-full border border-neutral-200 bg-white px-3 font-mono text-sm focus:border-black focus:outline-none"
        />
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          Postgres FTS over real GBrain pages · source = watchdog
        </p>
        {!hits && !q && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => {
                  setQ(s);
                  run(s);
                }}
                className="border border-neutral-200 px-2 py-1 font-mono text-[10px] text-neutral-500 hover:border-black hover:text-black"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="flex-1 overflow-y-auto">
        {pending && (
          <p className="px-4 py-4 font-mono text-xs uppercase tracking-widest text-neutral-500">
            Searching…
          </p>
        )}
        {error && (
          <p className="px-4 py-4 font-mono text-xs text-black">{error}</p>
        )}
        {hits && hits.length === 0 && !pending && (
          <p className="px-4 py-4 font-mono text-xs uppercase tracking-widest text-neutral-400">
            No matches
          </p>
        )}
        {hits && hits.length > 0 && (
          <ul className="divide-y divide-neutral-200">
            {hits.map((h) => (
              <li key={h.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onFocusGbrainId?.(`gbrain:${h.id}`)}
                  className="group flex w-full items-start gap-3 text-left"
                >
                  <RankBar value={h.rank} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-widest",
                          h.kind === "pattern"
                            ? "text-black"
                            : h.kind === "baseline"
                              ? "text-neutral-700"
                              : h.kind === "intel_note"
                                ? "text-neutral-500"
                                : "text-neutral-500",
                        )}
                      >
                        {h.kind}
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {h.rank.toFixed(3)}
                      </span>
                    </div>
                    <div className="font-mono text-sm text-black group-hover:underline">
                      {h.title}
                    </div>
                    {h.tags.length > 0 && (
                      <div className="mt-1 truncate font-mono text-[10px] text-neutral-500">
                        {h.tags.slice(0, 5).join(" · ")}
                      </div>
                    )}
                  </div>
                  <span
                    aria-hidden
                    className="font-mono text-xs text-neutral-300 group-hover:text-black"
                  >
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function RankBar({ value }: { value: number }) {
  const pct = Math.max(0.08, Math.min(1, value));
  return (
    <div
      className="mt-1 h-7 w-1 shrink-0 bg-neutral-200"
      aria-label={`rank ${value.toFixed(3)}`}
    >
      <div className="w-full bg-black" style={{ height: `${pct * 100}%` }} />
    </div>
  );
}
