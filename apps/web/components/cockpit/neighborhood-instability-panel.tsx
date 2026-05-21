import type { NeighborhoodInstability } from "@/lib/cockpit/instability";

const SEV_LETTER: Record<NeighborhoodInstability["topSeverity"], string> = {
  low: "L",
  med: "M",
  high: "H",
};

export function NeighborhoodInstabilityPanel({
  rows,
}: {
  rows: NeighborhoodInstability[];
}) {
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 py-3 pl-4 pr-20">
        <h2 className="font-mono text-[11px] uppercase tracking-widest">
          Neighborhood Instability
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          24h · weighted
        </span>
      </header>
      <ul className="font-mono text-[12px]">
        {rows.length === 0 ? (
          <li className="px-4 py-4 text-[10px] text-neutral-400">no signal</li>
        ) : (
          rows.map((r) => {
            const rounded = Math.round(r.score);
            return (
              <li
                key={r.neighborhood}
                className="grid grid-cols-[minmax(0,1fr)_2rem_4rem_2.5rem] items-baseline gap-3 border-b border-neutral-100 px-4 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-neutral-800">
                  {r.neighborhood}
                </span>
                <span
                  className={
                    "justify-self-start border border-neutral-300 px-1.5 py-0.5 text-[9px] uppercase tracking-widest" +
                    (r.topSeverity === "high"
                      ? " bg-black text-white"
                      : r.topSeverity === "med"
                        ? " text-neutral-800"
                        : " text-neutral-500")
                  }
                >
                  {SEV_LETTER[r.topSeverity]}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                  {r.count} src
                </span>
                <span className="text-right text-neutral-900">{rounded}</span>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
