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
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Live Feed
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          {rows.length} active
        </span>
      </header>
      <ul className="font-mono text-[11px]">
        {top.length === 0 ? (
          <li className="px-2.5 py-3 text-[10px] text-neutral-400">
            no active live incidents
          </li>
        ) : (
          top.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline gap-2 border-b border-neutral-100 px-2.5 py-1 last:border-b-0"
            >
              <span className="shrink-0 text-[9px] uppercase tracking-widest text-neutral-400">
                {age(r.occurredAt)}
              </span>
              <span className="shrink-0 border border-neutral-300 px-1 py-0.5 text-[8px] uppercase tracking-widest text-neutral-600">
                {KIND_LABEL[r.kind] ?? r.kind.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-neutral-800">
                {r.title}
              </span>
              {r.neighborhood && (
                <span className="shrink-0 text-[9px] text-neutral-500">
                  {r.neighborhood}
                </span>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
