import type { Severity } from "./types";

const STYLE: Record<
  Severity,
  { label: string; className: string; dot: string }
> = {
  low: {
    label: "Low",
    className: "border-emerald-500 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  med: {
    label: "Med",
    className: "border-amber-500 bg-amber-50 text-amber-800 font-medium",
    dot: "bg-amber-400",
  },
  high: {
    label: "High",
    className:
      "border-rose-600 bg-rose-500 text-white font-medium animate-[pulse_2s_ease-in-out_infinite]",
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
