import type { NamedCount } from "@/lib/cockpit/instability";

export function CrimeTypesPanel({ rows }: { rows: NamedCount[] }) {
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 py-3 pl-4 pr-20">
        <h2 className="font-mono text-[11px] uppercase tracking-widest">
          Crime Types
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          Top · 24h
        </span>
      </header>
      <ul className="font-mono text-[12px]">
        {rows.length === 0 ? (
          <li className="px-4 py-4 text-[10px] text-neutral-400">no signal</li>
        ) : (
          rows.map((r) => (
            <li
              key={r.name}
              className="flex items-baseline justify-between gap-4 border-b border-neutral-100 px-4 py-2 last:border-b-0"
            >
              <span className="truncate text-neutral-800">{r.name}</span>
              <span className="shrink-0 text-neutral-500">{r.count}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
