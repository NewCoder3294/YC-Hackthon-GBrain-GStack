import type { NamedCount } from "@/lib/cockpit/instability";

export function SourceMixPanel({ rows }: { rows: NamedCount[] }) {
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Source Mix
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          24h
        </span>
      </header>
      <ul className="font-mono text-[11px]">
        {rows.length === 0 ? (
          <li className="px-2.5 py-3 text-[10px] text-neutral-400">no signal</li>
        ) : (
          rows.map((r) => {
            const pct = total === 0 ? 0 : Math.round((r.count / total) * 100);
            return (
              <li
                key={r.name}
                className="border-b border-neutral-100 px-2.5 py-1 last:border-b-0"
              >
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-neutral-800">{r.name}</span>
                  <span className="text-neutral-500">{r.count}</span>
                </div>
                <div className="mt-0.5 h-0.5 w-full overflow-hidden bg-neutral-100">
                  <div className="h-full bg-black" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
