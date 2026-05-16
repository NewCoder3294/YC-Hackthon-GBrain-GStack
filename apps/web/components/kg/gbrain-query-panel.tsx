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
  const [open, setOpen] = useState(false);
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
        className="pointer-events-auto absolute right-4 top-[4.5rem] z-10 flex items-center gap-1 border border-neutral-300 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
      >
        <span aria-hidden>?</span>
        Ask GBrain
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto absolute right-4 top-[4.5rem] z-10 flex max-h-[calc(100vh-6rem)] w-96 flex-col border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
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
          className="font-mono text-xs text-neutral-500 hover:text-black"
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
        className="border-b border-neutral-200 p-3"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="natural-language query…"
          autoFocus
          className="h-8 w-full border border-neutral-200 bg-white px-2 font-mono text-xs focus:border-black focus:outline-none"
        />
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          Postgres FTS over real GBrain pages · source = watchdog
        </p>
        {!hits && !q && (
          <div className="mt-2 flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => {
                  setQ(s);
                  run(s);
                }}
                className="border border-neutral-200 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500 hover:border-black hover:text-black"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="overflow-y-auto">
        {pending && (
          <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Searching…
          </p>
        )}
        {error && (
          <p className="px-3 py-3 font-mono text-[10px] text-black">{error}</p>
        )}
        {hits && hits.length === 0 && !pending && (
          <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            No matches
          </p>
        )}
        {hits && hits.length > 0 && (
          <ul className="divide-y divide-neutral-200">
            {hits.map((h) => (
              <li key={h.id} className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onFocusGbrainId?.(`gbrain:${h.id}`)}
                  className="group flex w-full items-start gap-2 text-left"
                >
                  <RankBar value={h.rank} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "font-mono text-[9px] uppercase tracking-widest",
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
                      <span className="font-mono text-[9px] text-neutral-400">
                        {h.rank.toFixed(3)}
                      </span>
                    </div>
                    <div className="truncate font-mono text-xs text-black group-hover:underline">
                      {h.title}
                    </div>
                    {h.tags.length > 0 && (
                      <div className="mt-1 truncate font-mono text-[9px] text-neutral-500">
                        {h.tags.slice(0, 5).join(" · ")}
                      </div>
                    )}
                  </div>
                  <span
                    aria-hidden
                    className="font-mono text-[10px] text-neutral-300 group-hover:text-black"
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
