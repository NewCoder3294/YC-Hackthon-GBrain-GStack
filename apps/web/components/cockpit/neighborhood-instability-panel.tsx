import type { NeighborhoodInstability } from "@/lib/cockpit/instability";

const SEV_LABEL: Record<NeighborhoodInstability["topSeverity"], string> = {
  low: "L",
  med: "M",
  high: "H",
};

/**
 * Ranked list of SF neighborhoods by rolling instability score (recency-
 * weighted incident severity, last 24 h). Mirrors World Monitor's
 * "Country Instability" panel — same ranked-list pattern, monochrome
 * shape-not-hue treatment.
 */
export function NeighborhoodInstabilityPanel({
  rows,
}: {
  rows: NeighborhoodInstability[];
}) {
  const peak = rows[0]?.score ?? 1;
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Neighborhood Instability
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          24h · weighted
        </span>
      </header>
      <ul className="font-mono text-[11px]">
        {rows.length === 0 ? (
          <li className="px-3 py-4 text-[10px] text-neutral-400">
            no incidents in last 24h
          </li>
        ) : (
          rows.map((r) => {
            const pct = peak > 0 ? Math.round((r.score / peak) * 100) : 0;
            return (
              <li
                key={r.neighborhood}
                className="border-b border-neutral-100 px-3 py-1.5 last:border-b-0"
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-neutral-800">
                    {r.neighborhood}
                  </span>
                  <span className="shrink-0 border border-neutral-300 px-1 py-0.5 text-[8px] uppercase tracking-widest text-neutral-600">
                    {SEV_LABEL[r.topSeverity]}
                  </span>
                  <span className="shrink-0 tabular-nums text-[10px] text-neutral-500">
                    {r.count} src
                  </span>
                  <span className="shrink-0 w-10 text-right tabular-nums text-neutral-800">
                    {Math.round(r.score)}
                  </span>
                </div>
                {/* Hairline bar — relative scale to the top neighborhood. */}
                <div
                  aria-hidden
                  className="mt-1 h-px bg-neutral-200"
                >
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
