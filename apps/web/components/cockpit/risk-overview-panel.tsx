import type { CityRiskSnapshot } from "@/lib/cockpit/instability";

/**
 * City-wide risk hero panel. Mirrors World Monitor's "Strategic Risk
 * Overview" — a single dominant numeric score, a trend arrow, and one
 * focal pointer (most-volatile neighborhood). Pure presentational.
 */
export function RiskOverviewPanel({ snapshot }: { snapshot: CityRiskSnapshot }) {
  const trendGlyph =
    snapshot.trend === "up" ? "▲" : snapshot.trend === "down" ? "▼" : "•";
  const trendLabel =
    snapshot.trend === "up"
      ? `+${snapshot.trendPct}%`
      : snapshot.trend === "down"
        ? `${snapshot.trendPct}%`
        : "stable";

  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Risk Overview
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          24h · live
        </span>
      </header>
      <div className="grid grid-cols-3 gap-2 px-2.5 py-2 font-mono">
        <Cell
          label="City"
          value={String(snapshot.cityScore)}
          sub="/ 100"
        />
        <Cell
          label="24h"
          value={String(snapshot.totalIncidents)}
          sub="incidents"
        />
        <Cell
          label="Trend"
          value={trendGlyph}
          sub={trendLabel}
        />
      </div>
      {snapshot.topNeighborhood && (
        <div className="border-t border-neutral-200 px-2.5 py-1.5 font-mono text-[10px] text-neutral-600">
          <span className="text-[9px] uppercase tracking-widest text-neutral-400">
            Focal&nbsp;
          </span>
          <span className="text-neutral-800">{snapshot.topNeighborhood}</span>
        </div>
      )}
    </section>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[8px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <span className="text-[15px] leading-none tabular-nums text-neutral-900">
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-widest text-neutral-400">
        {sub}
      </span>
    </div>
  );
}
