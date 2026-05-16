import type { Severity } from "./types";

const STYLE: Record<Severity, { label: string; className: string }> = {
  low: {
    label: "Low",
    className: "border-neutral-200 text-neutral-500",
  },
  med: {
    label: "Med",
    className: "border-neutral-700 text-neutral-700 font-medium",
  },
  high: {
    label: "High",
    className:
      "border-black bg-black text-white font-medium animate-[pulse_2s_ease-in-out_infinite]",
  },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = STYLE[severity];
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${s.className}`}
    >
      {s.label}
    </span>
  );
}
