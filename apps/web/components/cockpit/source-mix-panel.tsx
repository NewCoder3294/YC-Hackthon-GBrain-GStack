import type { NamedCount } from "@/lib/cockpit/instability";

/**
 * Which news sources are contributing signal in the last 24 h. Useful to
 * spot single-source bias before it skews the city score.
 */
export function SourceMixPanel({ rows }: { rows: NamedCount[] }) {
  const peak = rows[0]?.count ?? 1;
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Source Mix
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          24h
        </span>
      </header>
      <ul className="font-mono text-[11px]">
        {rows.length === 0 ? (
          <li className="px-3 py-4 text-[10px] text-neutral-400">
            no sources contributing
          </li>
        ) : (
          rows.map((r) => {
            const pct = peak > 0 ? Math.round((r.count / peak) * 100) : 0;
            return (
              <li
                key={r.name}
                className="border-b border-neutral-100 px-3 py-1.5 last:border-b-0"
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-neutral-700">
                    {r.name}
                  </span>
                  <span className="shrink-0 w-8 text-right tabular-nums text-neutral-800">
                    {r.count}
                  </span>
                </div>
                <div aria-hidden className="mt-1 h-px bg-neutral-200">
                  <div
                    className="h-px bg-neutral-800"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
