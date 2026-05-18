"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Hours back from "now". 0 = now. Range: [-24, 0]. */
  value: number;
  onChange: (hours: number) => void;
  className?: string;
}

const MIN_HOURS = -24;
const MAX_HOURS = 0;
const STEP = 0.5;

function formatLabel(hours: number): string {
  if (hours === 0) return "now";
  if (hours === -24) return "−24h";
  const abs = Math.abs(hours);
  if (abs < 1) return `−${Math.round(abs * 60)}m`;
  return `−${abs}h`;
}

/** Time scrubber. Freezes the map filter to a single point on the [-24h, now] axis. */
export function TimeScrubber({ value, onChange, className }: Props) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-md border border-neutral-300 bg-white/95 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-neutral-700 shadow-sm backdrop-blur",
        className,
      )}
      role="group"
      aria-label="Time window scrubber"
    >
      <span className="text-neutral-500">window</span>
      <span className="text-neutral-500">−24h</span>
      <input
        type="range"
        min={MIN_HOURS}
        max={MAX_HOURS}
        step={STEP}
        value={value}
        onChange={handleChange}
        aria-label="Time offset from now (hours)"
        aria-valuenow={value}
        aria-valuetext={formatLabel(value)}
        className="h-1 w-48 cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-900"
      />
      <span className="text-neutral-500">now</span>
      <span className="ml-2 min-w-[3.5rem] text-right font-medium text-neutral-900">
        {formatLabel(value)}
      </span>
      {value !== 0 && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="ml-1 rounded-sm border border-neutral-300 px-1.5 py-0.5 text-[9px] uppercase hover:border-neutral-500 hover:bg-neutral-50"
          aria-label="Reset to now"
        >
          reset
        </button>
      )}
    </div>
  );
}
