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
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Neighborhood Instability
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          24h · weighted
        </span>
      </header>
      <ul className="font-mono text-[11px]">
        {rows.length === 0 ? (
          <li className="px-2.5 py-3 text-[10px] text-neutral-400">no signal</li>
        ) : (
          rows.map((r) => {
            const rounded = Math.round(r.score);
            return (
              <li
                key={r.neighborhood}
                className="flex items-baseline gap-2 border-b border-neutral-100 px-2.5 py-1 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-neutral-800">
                  {r.neighborhood}
                </span>
                <span
                  className={
                    "shrink-0 border border-neutral-300 px-1 py-0.5 text-[8px] uppercase tracking-widest" +
                    (r.topSeverity === "high"
                      ? " bg-black text-white"
                      : r.topSeverity === "med"
                        ? " text-neutral-800"
                        : " text-neutral-500")
                  }
                >
                  {SEV_LETTER[r.topSeverity]}
                </span>
                <span className="shrink-0 text-[9px] uppercase tracking-widest text-neutral-400">
                  {r.count} src
                </span>
                <span className="shrink-0 text-neutral-900">{rounded}</span>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
