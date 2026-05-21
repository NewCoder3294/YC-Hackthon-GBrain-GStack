export default function WallPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] border-t border-neutral-200 bg-white">
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center px-6 py-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500">
          Wall offline
        </p>
        <h1 className="mt-4 font-mono text-2xl uppercase tracking-[0.12em] text-black sm:text-3xl">
          Rebuild in progress
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-6 text-neutral-600">
          The camera wall has been stripped from the launch build while the feed
          architecture is rebuilt. Map, live incidents, alerts, and intake remain
          online.
        </p>
      </section>
    </main>
  );
}
