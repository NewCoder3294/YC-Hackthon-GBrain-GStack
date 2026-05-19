"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { buildPermalink, type MapState } from "@/lib/map/state";

interface Props {
  state: MapState;
  className?: string;
}

/** Copy-to-clipboard pill for the current canonical map URL. */
export function Permalink({ state, className }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    const url =
      (typeof window !== "undefined" ? window.location.origin : "") +
      buildPermalink(state);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Fallback: select & copy from temp input.
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
      } finally {
        ta.remove();
      }
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy permalink to clipboard"
      className={cn(
        "pointer-events-auto rounded-md border border-neutral-300 bg-white/95 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-neutral-700 shadow-sm backdrop-blur hover:border-neutral-500 hover:bg-neutral-50",
        className,
      )}
    >
      {copied ? "copied ✓" : "copy permalink"}
    </button>
  );
}
