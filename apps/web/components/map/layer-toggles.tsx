"use client";

import { cn } from "@/lib/utils";
import type { LayerId } from "@/lib/map/state";

export interface LayerSpec {
  id: LayerId;
  label: string;
  count: number;
}

interface Props {
  layers: LayerSpec[];
  hidden: Set<LayerId>;
  onToggle: (id: LayerId) => void;
  className?: string;
  heatmap: boolean;
  onHeatmapToggle: () => void;
}

/**
 * Left-rail layer panel. Replaces the legacy top filter strip.
 * Shows every source with its current row count; toggle hides client-side
 * with no server roundtrip. Keyboard-accessible via Tab + Space/Enter.
 */
export function LayerToggles({
  layers,
  hidden,
  onToggle,
  className,
  heatmap,
  onHeatmapToggle,
}: Props) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-44 flex-col gap-2 rounded-md border border-neutral-300 bg-white/95 p-3 text-[10px] font-mono uppercase tracking-wider text-neutral-700 shadow-sm backdrop-blur",
        className,
      )}
      role="group"
      aria-label="Map layers"
    >
      <div className="text-[9px] text-neutral-500">layers</div>
      <ul className="flex flex-col gap-1">
        {layers.map((layer) => {
          const isHidden = hidden.has(layer.id);
          return (
            <li key={layer.id}>
              <button
                type="button"
                onClick={() => onToggle(layer.id)}
                aria-pressed={!isHidden}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left transition-colors",
                  "hover:border-neutral-300 hover:bg-neutral-50",
                  "focus:outline-none focus-visible:border-neutral-500 focus-visible:bg-neutral-50",
                  isHidden && "text-neutral-400",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "inline-block h-2 w-2 rounded-full border",
                      isHidden
                        ? "border-neutral-400 bg-white"
                        : "border-neutral-900 bg-neutral-900",
                    )}
                  />
                  <span>{layer.label}</span>
                </span>
                <span
                  className={cn(
                    "tabular-nums text-[9px]",
                    isHidden ? "text-neutral-400" : "text-neutral-500",
                  )}
                >
                  {layer.count.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <hr className="border-neutral-200" />
      <button
        type="button"
        onClick={onHeatmapToggle}
        aria-pressed={heatmap}
        className={cn(
          "flex items-center justify-between gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50",
          heatmap ? "text-neutral-900" : "text-neutral-500",
        )}
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "inline-block h-2 w-2 rounded-full border",
              heatmap
                ? "border-neutral-900 bg-neutral-900"
                : "border-neutral-400 bg-white",
            )}
          />
          <span>heatmap</span>
        </span>
        <span className="text-[9px] text-neutral-400">kde</span>
      </button>
    </div>
  );
}
