interface Props {
  /** 24 ints, oldest (23h ago) → newest (now). */
  buckets: number[];
}

export function HourlyPulsePanel({ buckets }: Props) {
  const max = Math.max(1, ...buckets);
  const total = buckets.reduce((acc, n) => acc + n, 0);
  const peakIdx = buckets.indexOf(max);
  const peakOffset = peakIdx === -1 ? null : peakIdx - 23;
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          Hourly Pulse
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          {total} · 24h
        </span>
      </header>
      <div className="px-3 py-3">
        <div className="flex h-14 items-end gap-px">
          {buckets.map((n, i) => {
            const h = max === 0 ? 0 : Math.round((n / max) * 100);
            return (
              <div
                key={i}
                title={`${i === 23 ? "now" : `-${23 - i}h`}: ${n}`}
                className="flex-1 bg-black"
                style={{ height: `${h}%`, minHeight: n > 0 ? 2 : 0 }}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          <span>-23h</span>
          {peakOffset !== null && (
            <span>
              peak {max} @ {peakOffset === 0 ? "0h" : `${peakOffset}h`}
            </span>
          )}
          <span>now</span>
        </div>
      </div>
    </section>
  );
}
