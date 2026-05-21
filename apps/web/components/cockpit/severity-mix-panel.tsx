import type { SeverityBreakdown } from "@/lib/cockpit/instability";

export function SeverityMixPanel({
  severity,
}: {
  severity: SeverityBreakdown;
}) {
  const total = severity.high + severity.med + severity.low;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 py-3 pl-4 pr-20">
        <h2 className="font-mono text-[11px] uppercase tracking-widest">
          Severity Mix
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {total} · 24h
        </span>
      </header>
      <div className="space-y-3 px-4 py-4">
        <div className="flex h-2 w-full overflow-hidden border border-neutral-200">
          <div
            className="bg-black"
            style={{ width: `${pct(severity.high)}%` }}
            title={`high ${severity.high}`}
          />
          <div
            className="bg-neutral-500"
            style={{ width: `${pct(severity.med)}%` }}
            title={`med ${severity.med}`}
          />
          <div
            className="bg-neutral-300"
            style={{ width: `${pct(severity.low)}%` }}
            title={`low ${severity.low}`}
          />
        </div>
        <ul className="grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          <li className="border border-neutral-100 px-2 py-2">
            <span className="inline-block h-1.5 w-1.5 bg-black align-middle" />{" "}
            <span className="text-neutral-900">High</span>{" "}
            <span className="text-neutral-500">{severity.high}</span>
          </li>
          <li className="border border-neutral-100 px-2 py-2">
            <span className="inline-block h-1.5 w-1.5 bg-neutral-500 align-middle" />{" "}
            <span className="text-neutral-900">Med</span>{" "}
            <span className="text-neutral-500">{severity.med}</span>
          </li>
          <li className="border border-neutral-100 px-2 py-2">
            <span className="inline-block h-1.5 w-1.5 bg-neutral-300 align-middle" />{" "}
            <span className="text-neutral-900">Low</span>{" "}
            <span className="text-neutral-500">{severity.low}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
