/**
 * 24-bar pulse chart of incident counts per hour over the last 24 h.
 * Oldest on the left (23h ago) → newest on the right (now). Each bar
 * height is relative to the peak hour in the window.
 */
export function HourlyPulsePanel({ buckets }: { buckets: number[] }) {
  const peak = Math.max(1, ...buckets);
  const total = buckets.reduce((a, b) => a + b, 0);
  const peakHour = buckets.indexOf(Math.max(...buckets));
  const hoursAgo = 23 - peakHour;

  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Hourly Pulse
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          {total} · 24h
        </span>
      </header>
      <div className="px-2.5 py-2 font-mono">
        <div className="flex h-12 items-end gap-px">
          {buckets.map((n, i) => {
            const h = Math.round((n / peak) * 100);
            return (
              <div
                key={i}
                className="flex-1 bg-neutral-800"
                style={{ height: `${Math.max(2, h)}%` }}
                aria-label={`${n} incidents ${23 - i}h ago`}
                title={`${n} incidents · ${23 - i}h ago`}
              />
            );
          })}
        </div>
        <div className="mt-2 flex items-baseline justify-between text-[9px] uppercase tracking-widest text-neutral-500">
          <span>-23h</span>
          <span className="text-neutral-700 tabular-nums">
            peak {Math.max(...buckets)} @ -{hoursAgo}h
          </span>
          <span>now</span>
        </div>
      </div>
    </section>
  );
}
