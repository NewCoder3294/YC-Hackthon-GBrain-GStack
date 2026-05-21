export default function WallLoading() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3 border border-neutral-200 px-3 py-2">
        <div className="h-7 w-36 animate-pulse bg-neutral-100" />
        <div className="h-7 w-56 animate-pulse bg-neutral-100" />
        <div className="ml-auto h-7 w-64 animate-pulse bg-neutral-100" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="relative flex aspect-video items-center justify-center overflow-hidden border border-neutral-200 bg-neutral-100"
          >
            <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(245,245,245,0.78),rgba(229,229,229,0.92),rgba(245,245,245,0.78))] bg-[length:220%_100%]" />
            <span className="relative bg-white/80 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                Loading camera wall
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
