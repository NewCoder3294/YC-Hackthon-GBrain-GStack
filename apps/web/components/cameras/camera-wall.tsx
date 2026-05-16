"use client";

import { useMemo, useState } from "react";
import { CameraTile, type CameraTileData } from "./camera-tile";
import { cn } from "@/lib/utils";

interface Props {
  cameras: CameraTileData[];
}

const GRID_OPTIONS = [
  { label: "3", cols: "grid-cols-3", cap: 9 },
  { label: "4", cols: "grid-cols-4", cap: 16 },
  { label: "5", cols: "grid-cols-5", cap: 25 },
  { label: "6", cols: "grid-cols-6", cap: 36 },
] as const;

type StreamFilter = "all" | "hls" | "mjpeg";

export function CameraWall({ cameras }: Props) {
  const [grid, setGrid] = useState<(typeof GRID_OPTIONS)[number]>(GRID_OPTIONS[1]);
  const [route, setRoute] = useState<string>("all");
  const [stream, setStream] = useState<StreamFilter>("hls");
  const [query, setQuery] = useState("");

  const routes = useMemo(() => {
    const set = new Set<string>();
    for (const c of cameras) set.add(c.route);
    return ["all", ...Array.from(set).sort()];
  }, [cameras]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cameras
      .filter((c) => stream === "all" || c.streamType === stream)
      .filter((c) => route === "all" || c.route === route)
      .filter(
        (c) =>
          !q ||
          c.description.toLowerCase().includes(q) ||
          c.route.toLowerCase().includes(q),
      )
      .slice(0, grid.cap);
  }, [cameras, stream, route, query, grid.cap]);

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
                onClick={() => setStream(opt)}
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

        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Route
          </span>
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="h-7 border border-neutral-200 bg-white px-2 font-mono text-xs uppercase focus:border-black focus:outline-none"
          >
            {routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="street / route"
            className="h-7 w-56 border border-neutral-200 bg-white px-2 font-mono text-xs placeholder:text-neutral-300 focus:border-black focus:outline-none"
          />
        </label>

        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {filtered.length} / {cameras.length}
        </span>
      </div>

      <div className={cn("grid gap-2", grid.cols)}>
        {filtered.map((c) => (
          <CameraTile key={c.id} camera={c} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="border border-dashed border-neutral-200 p-12 text-center font-mono text-xs text-neutral-500">
          No cameras match these filters.
        </p>
      )}
    </div>
  );
}
