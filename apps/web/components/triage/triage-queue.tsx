"use client";

import { useEffect, useRef, useState } from "react";
import type { RankedIncident, Tier } from "@/lib/incidents/ranked";

interface Props {
  initial: RankedIncident[];
  // True when the server kicked correlation in the background because the
  // most-recent incident page was stale. Affects only the empty-state copy.
  kickedBackground?: boolean;
}

const POLL_MS = 15_000;

// Monochrome tiers — priority encoded via weight, fill, and border stroke,
// never hue (project aesthetic spec).
const TIER_STYLE: Record<Tier, string> = {
  P1: "border-2 border-black bg-black text-white font-bold",
  P2: "border-2 border-black bg-white text-black font-semibold",
  P3: "border border-neutral-400 bg-neutral-50 text-neutral-800",
  P4: "border border-neutral-300 bg-white text-neutral-400",
};

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function TriageQueue({ initial, kickedBackground = false }: Props) {
  const [incidents, setIncidents] = useState<RankedIncident[]>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch("/api/incidents/ranked", {
          cache: "no-store",
        });
        if (!res.ok || !alive) return;
        const body = (await res.json()) as {
          success: boolean;
          data?: RankedIncident[];
        };
        if (alive && body.success && body.data) {
          setIncidents(body.data);
          setLive(true);
          setTimeout(() => alive && setLive(false), 1000);
        }
      } catch {
        // transient — keep last good state, try again next tick
      }
    };
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border border-dashed border-neutral-300 p-8 text-center font-mono text-xs text-neutral-500">
        {kickedBackground ? (
          <>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
              <span className="uppercase tracking-widest">
                Correlator running
              </span>
            </span>
            <span>
              No active incidents in the current signal window. Re-checking
              every 15s.
            </span>
          </>
        ) : (
          <span>No active incidents in the current signal window.</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            live ? "bg-black" : "animate-pulse bg-neutral-400"
          }`}
        />
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          {live ? "Re-ranked" : "Polling 15s"}
        </span>
      </div>

      {incidents.map((i, idx) => {
        const isOpen = open === i.slug;
        return (
          <div
            key={i.slug}
            className="border border-neutral-200 bg-white"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i.slug)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <span className="w-5 font-mono text-xs text-neutral-300">
                {idx + 1}
              </span>
              <span
                className={`border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${TIER_STYLE[i.tier]}`}
              >
                {i.tier}
              </span>
              <span className="flex-1 truncate text-sm">
                <span className="font-medium">{i.affinity}</span>
                <span className="text-neutral-400"> · {i.neighborhood}</span>
              </span>
              <span className="hidden gap-1 sm:flex">
                {i.sources.map((s) => (
                  <span
                    key={s}
                    className="bg-neutral-100 px-1 font-mono text-[9px] uppercase tracking-wide text-neutral-500"
                  >
                    {s}
                  </span>
                ))}
              </span>
              <span className="w-16 text-right font-mono text-[10px] text-neutral-400">
                {ageLabel(i.updatedAt)}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-neutral-100 px-3 py-2.5 text-xs text-neutral-600">
                <p className="mb-2">{i.rationale || "No rationale recorded."}</p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] sm:grid-cols-4">
                  <div>
                    <dt className="text-neutral-400">priority</dt>
                    <dd>{i.priority.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">signals</dt>
                    <dd>{i.samples}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">sources</dt>
                    <dd>{i.sourceCount}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">confidence</dt>
                    <dd>{i.confidence.toFixed(2)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
