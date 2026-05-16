// Demo-time mapping for live_incidents.
//
// The real DataSF SFPD CAD feed has ~15–25 min source-side lag, and 311 /
// SFPD reports refresh nightly — so a freshly-loaded /live page can show
// a top row that's hours old. For dispatcher-demo purposes we time-shift
// the buffered rows so the newest appears to have "just happened" and the
// rest drip in at the top of the feed over compressed demo time.
//
// The underlying data and ingestion pipeline are unchanged — this is a
// pure display transform applied on the client. Raw timestamps are still
// available on the detail page's raw payload viewer.
//
// Mapping math:
//   anchor          = the demo "now zero" — captured at mount, never moves
//   newestRealMs    = max occurredAt across the buffer
//   age             = newestRealMs - row.occurredAt   (0 for newest)
//   displayedAt     = anchor - leadMs + age * shrink
//
// With shrink = 0.1 (the default), a 2-hour buffer of real activity
// reveals over ~12 demo minutes. The newest real row is "leadMs" old at
// the anchor moment; everything else trails behind, dripping in at the
// top of the feed as wall-clock now ≥ displayedAt.

export interface DemoTimeOptions {
  /** The demo's reference instant — typically captured once at mount. */
  anchor: Date;
  /**
   * Compression ratio. 0.1 maps 2 h of real activity onto ~12 min of demo
   * time. 1.0 disables compression (rows reveal at real-time intervals).
   */
  shrink?: number;
  /**
   * Offset between a row's reveal time and its displayed timestamp, in ms.
   * Defaults to 30 s — the newest row will appear "30 seconds ago" when
   * it first becomes visible. Set to 0 to anchor exactly at the reveal
   * moment.
   */
  leadMs?: number;
}

export interface DemoTimedRow<T> {
  row: T;
  displayedAt: Date;
}

export function applyDemoTime<T extends { occurredAt: string }>(
  rows: T[],
  now: Date,
  opts: DemoTimeOptions,
): DemoTimedRow<T>[] {
  const shrink = opts.shrink ?? 0.1;
  const leadMs = opts.leadMs ?? 30_000;
  if (rows.length === 0) return [];

  let newestRealMs = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const t = new Date(row.occurredAt).getTime();
    if (Number.isFinite(t) && t > newestRealMs) newestRealMs = t;
  }
  if (newestRealMs === Number.NEGATIVE_INFINITY) return [];

  const nowMs = now.getTime();
  const anchorMs = opts.anchor.getTime();
  const visible: DemoTimedRow<T>[] = [];
  for (const row of rows) {
    const realMs = new Date(row.occurredAt).getTime();
    if (Number.isNaN(realMs)) continue;
    const ageMs = newestRealMs - realMs;
    const displayedMs = anchorMs - leadMs + ageMs * shrink;
    if (displayedMs > nowMs) continue;
    visible.push({ row, displayedAt: new Date(displayedMs) });
  }
  visible.sort((a, b) => b.displayedAt.getTime() - a.displayedAt.getTime());
  return visible;
}
