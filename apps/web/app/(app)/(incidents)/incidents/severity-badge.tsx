import type { Severity } from "./types";

// Monochrome severity ladder — weight, fill, pulse motion. No hue.
const STYLE: Record<
  Severity,
  { label: string; className: string; dot: string }
> = {
  low: {
    label: "Low",
    className: "border-neutral-300 bg-white text-neutral-500",
    dot: "bg-neutral-400",
  },
  med: {
    label: "Med",
    className: "border-neutral-700 bg-white text-neutral-800 font-medium",
    dot: "bg-neutral-700",
  },
  high: {
    label: "High",
    className:
      "border-black bg-black text-white font-medium animate-[pulse_2s_ease-in-out_infinite]",
    dot: "bg-white",
  },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = STYLE[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${s.className}`}
    >
      <span className={`inline-block h-1 w-1 ${s.dot}`} />
      {s.label}
    </span>
  );
}
