import type { CityRiskSnapshot } from "@/lib/cockpit/instability";

const TREND_GLYPH: Record<CityRiskSnapshot["trend"], string> = {
  up: "▲",
  flat: "—",
  down: "▼",
};

export function RiskOverviewPanel({ snapshot }: { snapshot: CityRiskSnapshot }) {
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Risk Overview
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          24h · live
        </span>
      </header>
      <div className="grid grid-cols-3 gap-2 px-3 py-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        <div>
          <div className="text-[9px]">City</div>
          <div className="mt-0.5 font-mono text-2xl tracking-normal text-neutral-900">
            {snapshot.cityScore}
          </div>
          <div className="text-[9px] text-neutral-400">/ 100</div>
        </div>
        <div>
          <div className="text-[9px]">24h</div>
          <div className="mt-0.5 font-mono text-2xl tracking-normal text-neutral-900">
            {snapshot.totalIncidents}
          </div>
          <div className="text-[9px] text-neutral-400">incidents</div>
        </div>
        <div>
          <div className="text-[9px]">Trend</div>
          <div className="mt-0.5 font-mono text-2xl tracking-normal text-neutral-900">
            {TREND_GLYPH[snapshot.trend]}
          </div>
          <div className="text-[9px] text-neutral-400">
            {snapshot.trendPct > 0 ? "+" : ""}
            {snapshot.trendPct}%
          </div>
        </div>
      </div>
      {snapshot.topNeighborhood && (
        <div className="border-t border-neutral-200 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Focal{" "}
          <span className="text-neutral-800 tracking-normal normal-case">
            {snapshot.topNeighborhood}
          </span>
        </div>
      )}
    </section>
  );
}
