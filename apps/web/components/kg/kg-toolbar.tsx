"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { KIND_LABEL, KIND_ORDER, type KgNodeKind } from "./types";

interface Props {
  query: string;
  onQuery: (q: string) => void;
  hiddenKinds: Set<KgNodeKind>;
  onToggleKind: (k: KgNodeKind) => void;
  counts: Record<KgNodeKind, number>;
  focusedNodeLabel?: string | undefined;
  onClearFocus?: (() => void) | undefined;
  liveCount: number;
}

const KIND_SWATCH: Record<KgNodeKind, string> = {
  gang: "border-2 border-black bg-white",
  member: "border-black bg-white",
  territory: "border border-dashed border-black bg-white",
  arrest: "border-neutral-500 bg-neutral-50",
  alert: "border-2 border-black bg-black",
  incident: "border-black bg-white",
  pattern: "border-black bg-white rounded-full",
  baseline: "border-neutral-300 bg-neutral-50",
  location: "border-neutral-500 bg-white",
  decision: "border-black bg-black",
};

export function KgToolbar({
  query,
  onQuery,
  hiddenKinds,
  onToggleKind,
  counts,
  focusedNodeLabel,
  onClearFocus,
  liveCount,
}: Props) {
  return (
    <div className="pointer-events-auto absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center gap-3 border border-neutral-200 bg-white px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        GBrain
      </span>
      {liveCount > 0 && (
        <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
          {liveCount} live
        </span>
      )}
      <div className="h-3 w-px bg-neutral-200" />

      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search nodes…"
          className="h-7 w-52 text-xs"
        />
      </div>

      <div className="h-3 w-px bg-neutral-200" />

      <div className="flex items-center gap-1">
        {KIND_ORDER.map((kind) => {
          const hidden = hiddenKinds.has(kind);
          const count = counts[kind] ?? 0;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onToggleKind(kind)}
              aria-pressed={!hidden}
              className={cn(
                "group flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                hidden
                  ? "border-neutral-200 text-neutral-300"
                  : "border-neutral-300 text-black hover:border-black",
              )}
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 border transition-opacity",
                  KIND_SWATCH[kind],
                  hidden && "opacity-30",
                )}
              />
              <span>{KIND_LABEL[kind]}</span>
              <span
                className={cn(
                  "ml-1 font-mono text-[10px]",
                  hidden ? "text-neutral-300" : "text-neutral-500",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {focusedNodeLabel && (
        <>
          <div className="h-3 w-px bg-neutral-200" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
              Focused
            </span>
            <span className="max-w-[200px] truncate font-mono text-xs">
              {focusedNodeLabel}
            </span>
            <button
              type="button"
              onClick={onClearFocus}
              className="border border-neutral-200 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
            >
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}
