"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CockpitWidget {
  id: string;
  label: string;
  /** Legacy size hint kept so callers can order larger widgets first. */
  defaultSpan: 1 | 2;
  node: ReactNode;
}

interface Props {
  widgets: CockpitWidget[];
}

/** Renders the cockpit as a readable operations rail with hide/show controls. */
export function CockpitWidgetHost({ widgets }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = widgets.filter((w) => !hidden.has(w.id));

  return (
    <aside
      data-cockpit-sidebar
      className="w-full shrink-0 overflow-y-auto border-l border-neutral-200 bg-neutral-50 xl:w-[520px] 2xl:w-[580px]"
    >
      <header className="sticky top-0 z-20 border-b border-neutral-300 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-[11px] uppercase tracking-widest text-neutral-900">
              Cockpit
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Bay Area · live operations
            </p>
          </div>
          <span className="shrink-0 border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
            {visible.length}/{widgets.length} widgets
          </span>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-3 p-3">
        {widgets.map((w) => (
          <div
            key={w.id}
            data-cockpit-widget={w.id}
            className={cn(
              "relative border border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]",
              w.defaultSpan === 1 && "min-h-0",
              hidden.has(w.id) && "opacity-50",
            )}
          >
            {hidden.has(w.id) ? (
              <button
                type="button"
                aria-label={`Show ${w.label}`}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    next.delete(w.id);
                    return next;
                  })
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:bg-white hover:text-black"
              >
                <span>{w.label}</span>
                <span>show</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  title="Hide"
                  aria-label={`Hide ${w.label}`}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      next.add(w.id);
                      return next;
                    })
                  }
                  className="absolute right-3 top-3 z-10 border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-400 hover:border-neutral-500 hover:text-black"
                >
                  hide
                </button>
                {w.node}
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
