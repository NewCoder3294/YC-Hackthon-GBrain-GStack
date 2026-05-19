"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CockpitWidget {
  id: string;
  label: string;
  /** Column span (1 or 2). The grid is 2 cols. */
  defaultSpan: 1 | 2;
  node: ReactNode;
}

interface Props {
  widgets: CockpitWidget[];
}

/**
 * Renders the cockpit widget grid. Each tile is wrapped with a small
 * header chip carrying a drag handle (reorder support is intentionally
 * minimal — Batch C may layer interactivity on top of this).
 */
export function CockpitWidgetHost({ widgets }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = widgets.filter((w) => !hidden.has(w.id));

  return (
    <aside className="w-[420px] shrink-0 overflow-y-auto border-l border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-300 px-3 py-2">
        <h1 className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
          Cockpit
        </h1>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          {visible.length}/{widgets.length} · Widgets
        </span>
      </header>
      <div className="grid grid-cols-2 gap-0">
        {widgets.map((w) => (
          <div
            key={w.id}
            className={cn(
              "relative border-b border-r border-neutral-200",
              w.defaultSpan === 2 ? "col-span-2" : "col-span-1",
              hidden.has(w.id) && "opacity-50",
            )}
          >
            <button
              type="button"
              title="Hide"
              aria-label={`Hide ${w.label}`}
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(w.id)) next.delete(w.id);
                  else next.add(w.id);
                  return next;
                })
              }
              className="pointer-events-auto absolute right-2 top-1.5 z-10 cursor-grab border border-neutral-200 bg-white px-1 font-mono text-[10px] text-neutral-500 hover:border-black hover:text-black active:cursor-grabbing"
            >
              ⋮⋮ {hidden.has(w.id) ? "+" : "×"}
            </button>
            {!hidden.has(w.id) && w.node}
          </div>
        ))}
      </div>
    </aside>
  );
}
