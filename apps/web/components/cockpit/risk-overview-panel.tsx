import type { CityRiskSnapshot } from "@/lib/cockpit/instability";

const TREND_GLYPH: Record<CityRiskSnapshot["trend"], string> = {
  up: "▲",
  flat: "—",
  down: "▼",
};

export function RiskOverviewPanel({ snapshot }: { snapshot: CityRiskSnapshot }) {
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 py-3 pl-4 pr-20">
        <h2 className="font-mono text-[11px] uppercase tracking-widest">
          Risk Overview
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          24h · live
        </span>
      </header>
      <div className="grid grid-cols-3 gap-3 px-4 py-4 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        <div className="border border-neutral-200 bg-neutral-50 px-3 py-3">
          <div>City</div>
          <div className="mt-1 font-mono text-3xl tracking-normal text-neutral-900">
            {snapshot.cityScore}
          </div>
          <div className="text-[9px] text-neutral-400">/ 100</div>
        </div>
        <div className="border border-neutral-200 bg-neutral-50 px-3 py-3">
          <div>24h</div>
          <div className="mt-1 font-mono text-3xl tracking-normal text-neutral-900">
            {snapshot.totalIncidents}
          </div>
          <div className="text-[9px] text-neutral-400">incidents</div>
        </div>
        <div className="border border-neutral-200 bg-neutral-50 px-3 py-3">
          <div>Trend</div>
          <div className="mt-1 font-mono text-3xl tracking-normal text-neutral-900">
            {TREND_GLYPH[snapshot.trend]}
          </div>
          <div className="text-[9px] text-neutral-400">
            {snapshot.trendPct > 0 ? "+" : ""}
            {snapshot.trendPct}%
          </div>
        </div>
      </div>
      {snapshot.topNeighborhood && (
        <div className="border-t border-neutral-200 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Focal{" "}
          <span className="text-neutral-800 tracking-normal normal-case">
            {snapshot.topNeighborhood}
          </span>
        </div>
      )}
    </section>
  );
}
