export default function WallLoading() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3 border border-neutral-200 px-3 py-2">
        <div className="h-7 w-44 animate-pulse bg-neutral-100" />
        <div className="h-7 w-56 animate-pulse bg-neutral-100" />
        <div className="h-7 w-40 animate-pulse bg-neutral-100" />
        <div className="ml-auto h-7 w-64 animate-pulse bg-neutral-100" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="relative flex aspect-video items-center justify-center overflow-hidden border border-neutral-200 bg-neutral-50"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
              Loading
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
