import type { SeverityBreakdown } from "@/lib/cockpit/instability";

/**
 * Stacked single-row bar of severity mix over the last 24 h — high / med /
 * low as proportional segments. Shape, not hue: severity is encoded by
 * fill density (solid → mid → hatched) rather than red/yellow/green.
 */
export function SeverityMixPanel({ severity }: { severity: SeverityBreakdown }) {
  const total = severity.high + severity.med + severity.low;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const cells: { label: string; key: keyof SeverityBreakdown; fill: string }[] = [
    { label: "High", key: "high", fill: "bg-neutral-900" },
    { label: "Med", key: "med", fill: "bg-neutral-500" },
    { label: "Low", key: "low", fill: "bg-neutral-300" },
  ];

  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Severity Mix
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          {total} · 24h
        </span>
      </header>
      <div className="px-3 py-3 font-mono">
        <div className="flex h-3 w-full overflow-hidden border border-neutral-300">
          {cells.map((c) => (
            <div
              key={c.key}
              aria-label={`${c.label} ${severity[c.key]}`}
              className={c.fill}
              style={{ width: `${pct(severity[c.key])}%` }}
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
          {cells.map((c) => (
            <div key={c.key} className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 ${c.fill}`} />
              <span className="text-neutral-500 uppercase tracking-widest text-[9px]">
                {c.label}
              </span>
              <span className="tabular-nums text-neutral-800">
                {severity[c.key]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
