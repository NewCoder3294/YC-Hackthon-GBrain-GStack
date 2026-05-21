import type { TrafficDisruption } from "@/lib/cockpit/traffic-disruptions";

function age(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function severityBadge(sev: TrafficDisruption["severity"]): string {
  if (sev === "high") return "bg-black text-white";
  if (sev === "med") return "border border-neutral-400 text-neutral-700";
  return "border border-neutral-200 text-neutral-500";
}

export function TrafficDisruptionsPanel({
  rows,
}: {
  rows: TrafficDisruption[];
}) {
  const top = rows.slice(0, 8);
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 py-3 pl-4 pr-20">
        <h2 className="font-mono text-[11px] uppercase tracking-widest">
          Traffic Disruptions
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {rows.length} · 511/CHP · 48h
        </span>
      </header>
      <ul className="font-mono text-[12px]">
        {top.length === 0 ? (
          <li className="px-4 py-4 text-[10px] text-neutral-400">
            no active traffic disruptions
          </li>
        ) : (
          top.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[3rem_4.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-b-0"
            >
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                {age(r.occurredAt)}
              </span>
              <span
                className={`w-fit px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${severityBadge(r.severity)}`}
              >
                {r.severity}
              </span>
              <span className="min-w-0 flex-1 truncate text-neutral-800">
                {r.summary}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
