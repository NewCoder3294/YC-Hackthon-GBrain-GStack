"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraTile, type CameraTileData, type CameraStatus } from "./camera-tile";
import { RouteCombobox } from "./route-combobox";
import { cn } from "@/lib/utils";

interface Props {
  cameras: CameraTileData[];
}

const GRID_OPTIONS = [
  { label: "3", cols: "grid-cols-2 md:grid-cols-3" },
  { label: "4", cols: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" },
  { label: "5", cols: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" },
  { label: "6", cols: "grid-cols-2 md:grid-cols-4 lg:grid-cols-6" },
] as const;

type StreamFilter = "all" | "hls" | "mjpeg";

const PAGE_SIZE = 24;

export function CameraWall({ cameras }: Props) {
  const [grid, setGrid] = useState<(typeof GRID_OPTIONS)[number]>(GRID_OPTIONS[1]);
  const [route, setRoute] = useState<string>("ALL");
  const [stream, setStream] = useState<StreamFilter>("hls");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hideOffline, setHideOffline] = useState(true);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(() => new Set());

  const reportStatus = useCallback((id: string, status: CameraStatus) => {
    setOfflineIds((prev) => {
      const has = prev.has(id);
      if (status === "offline" && !has) {
        const next = new Set(prev);
        next.add(id);
        return next;
      }
      if (status === "live" && has) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      return prev;
    });
  }, []);

  const routes = useMemo(() => {
    const set = new Set<string>();
    for (const c of cameras) set.add(c.route);
    return ["ALL", ...Array.from(set).sort()];
  }, [cameras]);

  // Base filters (route/stream/search) — stable across status changes so the
  // grid's anchor cameras don't reshuffle each time a tile flips to offline.
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cameras
      .filter((c) => stream === "all" || c.streamType === stream)
      .filter((c) => route === "ALL" || c.route === route)
      .filter(
        (c) =>
          !q ||
          c.description.toLowerCase().includes(q) ||
          c.route.toLowerCase().includes(q),
      );
  }, [cameras, stream, route, query]);

  // The window of cameras the user has loaded — independent of offline status.
  const pageWindow = useMemo(
    () => baseFiltered.slice(0, visibleCount),
    [baseFiltered, visibleCount],
  );

  // Within that window, drop offline tiles. Result: as tiles flip offline they
  // disappear from the grid, but no new tile slides up from beyond the window
  // to take their slot — anchor cameras keep their visual position.
  const visible = useMemo(
    () => (hideOffline ? pageWindow.filter((c) => !offlineIds.has(c.id)) : pageWindow),
    [pageWindow, hideOffline, offlineIds],
  );

  // Total currently displayable for the counter line below.
  const filtered = useMemo(
    () => (hideOffline ? baseFiltered.filter((c) => !offlineIds.has(c.id)) : baseFiltered),
    [baseFiltered, hideOffline, offlineIds],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3 border border-neutral-200 px-3 py-2">
        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Grid
          </span>
          <div className="flex">
            {GRID_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setGrid(opt)}
                className={cn(
                  "h-7 min-w-7 border border-neutral-200 px-2 font-mono text-xs",
                  grid.label === opt.label
                    ? "border-black bg-black text-white"
                    : "bg-white text-black hover:border-black",
                  opt.label !== GRID_OPTIONS[0].label && "border-l-0",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </label>

        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Stream
          </span>
          <div className="flex">
            {(["hls", "mjpeg", "all"] as StreamFilter[]).map((opt, i) => (
              <button
                key={opt}
                onClick={() => {
                  setStream(opt);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={cn(
                  "h-7 border border-neutral-200 px-2 font-mono text-xs uppercase",
                  stream === opt
                    ? "border-black bg-black text-white"
                    : "bg-white text-black hover:border-black",
                  i > 0 && "border-l-0",
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </label>

        <RouteCombobox
          value={route}
          options={routes}
          onChange={(v) => {
            setRoute(v);
            setVisibleCount(PAGE_SIZE);
          }}
        />

        <button
          onClick={() => setHideOffline((v) => !v)}
          className={cn(
            "flex h-7 items-center gap-1.5 border px-2 font-mono text-xs uppercase",
            hideOffline
              ? "border-black bg-black text-white"
              : "border-neutral-200 bg-white text-neutral-500 hover:border-black hover:text-black",
          )}
          title="Hide cameras reporting no signal"
        >
          <span className={cn("h-1.5 w-1.5", hideOffline ? "bg-white" : "bg-neutral-300")} />
          Online
        </button>

        <label className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Search
          </span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="street / route"
            className="h-7 w-56 border border-neutral-200 bg-white px-2 font-mono text-xs placeholder:text-neutral-300 focus:border-black focus:outline-none"
          />
        </label>

        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {visible.length} / {filtered.length} shown · {offlineIds.size} offline ·{" "}
          {cameras.length} total
        </span>
      </div>

      <div className={cn("grid gap-2", grid.cols)}>
        {visible.map((c) => (
          <CameraTile
            key={c.id}
            camera={c}
            onStatusChange={(s) => reportStatus(c.id, s)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="border border-dashed border-neutral-200 p-12 text-center font-mono text-xs text-neutral-500">
          No cameras match these filters.
        </p>
      )}

      {visibleCount < filtered.length && (
        <InfiniteScrollSentinel
          remaining={filtered.length - visibleCount}
          onLoadMore={() => setVisibleCount((c) => c + PAGE_SIZE)}
        />
      )}
    </div>
  );
}

function InfiniteScrollSentinel({
  remaining,
  onLoadMore,
}: {
  remaining: number;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onLoadMore]);
  return (
    <div
      ref={ref}
      className="self-center py-6 font-mono text-[10px] uppercase tracking-widest text-neutral-400"
    >
      Loading · {remaining} more
    </div>
  );
}
