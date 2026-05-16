"use client";

import { useMemo, useState } from "react";
import { CameraTile, type CameraTileData } from "./camera-tile";
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

const PAGE_SIZE = 60;

export function CameraWall({ cameras }: Props) {
  const [grid, setGrid] = useState<(typeof GRID_OPTIONS)[number]>(GRID_OPTIONS[1]);
  const [route, setRoute] = useState<string>("ALL");
  const [stream, setStream] = useState<StreamFilter>("hls");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const routes = useMemo(() => {
    const set = new Set<string>();
    for (const c of cameras) set.add(c.route);
    return ["ALL", ...Array.from(set).sort()];
  }, [cameras]);

  const filtered = useMemo(() => {
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

  const visible = filtered.slice(0, visibleCount);

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
          {visible.length} / {filtered.length} shown · {cameras.length} total
        </span>
      </div>

      <div className={cn("grid gap-2", grid.cols)}>
        {visible.map((c) => (
          <CameraTile key={c.id} camera={c} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="border border-dashed border-neutral-200 p-12 text-center font-mono text-xs text-neutral-500">
          No cameras match these filters.
        </p>
      )}

      {visibleCount < filtered.length && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="self-center border border-black bg-white px-4 py-2 font-mono text-xs uppercase tracking-widest hover:bg-black hover:text-white"
        >
          Show more · {filtered.length - visibleCount} remaining
        </button>
      )}
    </div>
  );
}
