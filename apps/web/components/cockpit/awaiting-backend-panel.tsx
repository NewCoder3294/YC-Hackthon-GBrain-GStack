interface Props {
  title: string;
  /** What the panel will show once the backend lands. */
  promise: string;
  /** Spec section this panel is owned by ("Phase 2 / SF Brief"). */
  scheduledFor: string;
}

/**
 * Honest stub for cockpit panels whose backend is not yet built. Renders
 * the title and a one-line description so the layout reads as complete
 * without faking content.
 */
export function AwaitingBackendPanel({ title, promise, scheduledFor }: Props) {
  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 px-2.5 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-widest">
          {title}
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          awaiting backend
        </span>
      </header>
      <div className="space-y-2 px-3 py-4 font-mono text-[10px] leading-relaxed text-neutral-500">
        <p>{promise}</p>
        <p className="text-[9px] uppercase tracking-widest text-neutral-400">
          {scheduledFor}
        </p>
      </div>
    </section>
  );
}
