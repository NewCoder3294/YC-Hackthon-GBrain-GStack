import type { EnvSignalKind, EnvSignalRow } from "@/lib/cockpit/environmental";

function age(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function severityBadge(sev: EnvSignalRow["severity"]): string {
  if (sev === "high") return "bg-black text-white";
  if (sev === "med") return "border border-neutral-400 text-neutral-700";
  return "border border-neutral-200 text-neutral-500";
}

const KIND_GLYPH: Record<EnvSignalKind, string> = {
  weather: "WTH",
  aqi: "AQI",
  quake: "EQK",
  aircraft: "AIR",
  vessel: "SEA",
  transit: "TRN",
};

/**
 * Top-5 env signal summary panel. Mirrors traffic-disruptions-panel.tsx
 * so the cockpit grid stays visually consistent. Sorted by severity then
 * recency so the operator's eye lands on high-severity weather/quake/
 * transit advisories before background AQI rows.
 */
export function EnvironmentalPanel({ rows }: { rows: EnvSignalRow[] }) {
  const severityOrder: Record<EnvSignalRow["severity"], number> = {
    high: 0,
    med: 1,
    low: 2,
  };
  const ranked = [...rows]
    .sort((a, b) => {
      const ds = severityOrder[a.severity] - severityOrder[b.severity];
      if (ds !== 0) return ds;
      return (
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );
    })
    .slice(0, 5);

  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Environmental
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          {rows.length} · 6 sources · active
        </span>
      </header>
      <ul className="font-mono text-[11px]">
        {ranked.length === 0 ? (
          <li className="px-2.5 py-3 text-[10px] text-neutral-400">
            no active environmental signals
          </li>
        ) : (
          ranked.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline gap-2 border-b border-neutral-100 px-2.5 py-1 last:border-b-0"
            >
              <span className="shrink-0 text-[9px] uppercase tracking-widest text-neutral-400">
                {age(r.occurredAt)}
              </span>
              <span className="shrink-0 px-1 py-0.5 text-[8px] uppercase tracking-widest border border-neutral-300 text-neutral-600">
                {KIND_GLYPH[r.kind]}
              </span>
              <span
                className={`shrink-0 px-1 py-0.5 text-[8px] uppercase tracking-widest ${severityBadge(r.severity)}`}
              >
                {r.severity}
              </span>
              <span className="min-w-0 flex-1 truncate text-neutral-800">
                {r.title}
                {r.subtitle ? (
                  <span className="text-neutral-500"> · {r.subtitle}</span>
                ) : null}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
