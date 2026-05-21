import type { LiveIncident } from "@/lib/live-incidents";

const KIND_LABEL: Record<string, string> = {
  cad_call: "CAD",
  fire_ems: "FIRE/EMS",
  traffic: "511",
  transit: "TRANSIT",
  report: "REPORT",
};

function age(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export function LiveFeedPanel({ rows }: { rows: LiveIncident[] }) {
  const top = rows.slice(0, 10);
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 py-3 pl-4 pr-20">
        <h2 className="font-mono text-[11px] uppercase tracking-widest">
          Live Feed
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {rows.length} active
        </span>
      </header>
      <ul className="font-mono text-[12px]">
        {top.length === 0 ? (
          <li className="px-4 py-4 text-[10px] text-neutral-400">
            no active live incidents
          </li>
        ) : (
          top.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[3rem_5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-neutral-100 px-4 py-2.5 last:border-b-0"
            >
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                {age(r.occurredAt)}
              </span>
              <span className="w-fit border border-neutral-300 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-neutral-600">
                {KIND_LABEL[r.kind] ?? r.kind.toUpperCase()}
              </span>
              <span className="min-w-0 truncate text-neutral-800">
                {r.title}
              </span>
              <span className="col-start-3 flex min-w-0 items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-400">
                {(r.corroboratingSources ?? 0) >= 1 && (
                  <span
                    className="shrink-0 border border-black bg-black px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-white"
                    title={`Cross-source verified by ${r.corroboratingSources} other source${(r.corroboratingSources ?? 0) === 1 ? "" : "s"}`}
                  >
                    ✓ {r.corroboratingSources}
                  </span>
                )}
                {r.neighborhood && (
                  <span className="min-w-0 truncate">{r.neighborhood}</span>
                )}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
