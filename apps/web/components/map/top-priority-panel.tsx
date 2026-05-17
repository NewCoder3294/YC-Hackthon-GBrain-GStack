"use client";

import { useEffect, useState } from "react";
import type { RankedIncident, Tier } from "@/lib/incidents/ranked";

interface Props {
  /** Center the map on an incident when its row is clicked. */
  onFocus: (lat: number, lng: number) => void;
  max?: number;
}

const POLL_MS = 15_000;

const TIER_DOT: Record<Tier, string> = {
  P1: "bg-red-500",
  P2: "bg-amber-500",
  P3: "bg-neutral-400",
  P4: "bg-neutral-300",
};

/**
 * Compact, always-on "what to dispatch first" card pinned on the map.
 * Reuses /api/incidents/ranked (the correlator's GBrain incident pages,
 * priority-ordered). Row click recenters the map on the incident.
 */
export function TopPriorityPanel({ onFocus, max = 5 }: Props) {
  const [items, setItems] = useState<RankedIncident[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch("/api/incidents/ranked", {
          cache: "no-store",
        });
        if (!alive) return;
        const body = (await res.json()) as {
          success: boolean;
          data?: RankedIncident[];
        };
        if (alive && body.success && body.data) {
          setItems(body.data.slice(0, max));
          setErr(false);
        }
      } catch {
        if (alive) setErr(true);
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [max]);

  const p1p2 = items.filter((i) => i.tier === "P1" || i.tier === "P2").length;

  return (
    <aside className="pointer-events-auto absolute left-4 top-20 z-10 w-72 border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between border-b border-neutral-200 px-3 py-2"
      >
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]">
          Top Priority
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          {p1p2 > 0 ? `${p1p2} P1/P2 · ` : ""}
          {collapsed ? "▸" : "▾"}
        </span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-neutral-100">
          {items.length === 0 && (
            <p className="px-3 py-3 font-mono text-[10px] text-neutral-400">
              {err
                ? "ranked feed unavailable"
                : "no active incidents — run the correlator"}
            </p>
          )}
          {items.map((i, idx) => (
            <button
              key={i.slug}
              type="button"
              onClick={() => i.lat && i.lng && onFocus(i.lat, i.lng)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-neutral-50"
              title={i.rationale}
            >
              <span className="mt-0.5 font-mono text-[10px] text-neutral-300">
                {idx + 1}
              </span>
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TIER_DOT[i.tier]}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-semibold">
                    {i.tier}
                  </span>
                  <span className="truncate text-xs font-medium">
                    {i.affinity}
                  </span>
                </span>
                <span className="block truncate text-[11px] text-neutral-500">
                  {i.neighborhood} · {i.sourceCount} src
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
