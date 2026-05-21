"use client";

import { useMemo, useState } from "react";
import { CameraTile, type CameraTileData } from "./camera-tile";
import { RouteCombobox } from "./route-combobox";
import { cn } from "@/lib/utils";

interface Props {
  cameras: CameraTileData[];
}

type GroupFilter = "all" | "freeway" | "streets" | "live" | "private";

const GROUP_LABEL: Record<GroupFilter, string> = {
  all: "All",
  freeway: "Freeway",
  streets: "Streets",
  live: "Live cams",
  private: "Private",
};

function cameraGroup(
  source: import("./camera-tile").CameraSource,
): Exclude<GroupFilter, "all"> {
  switch (source) {
    case "caltrans":
      return "freeway";
    case "windy":
      return "live";
    case "contributor":
      return "private";
    case "curated":
    case "sfmta":
    case "demo":
    default:
      return "streets";
  }
}

export function CameraWall({ cameras }: Props) {
  const [route, setRoute] = useState<string>("ALL");
  const [group, setGroup] = useState<GroupFilter>("all");
  const [query, setQuery] = useState("");

  // Only show group pills for groups that actually have cameras present,
  // so the toolbar doesn't show empty buckets like "Private" with zero rows.
  const availableGroups = useMemo<GroupFilter[]>(() => {
    const present = new Set<Exclude<GroupFilter, "all">>();
    for (const c of cameras) present.add(cameraGroup(c.source ?? "caltrans"));
    const ordered: GroupFilter[] = ["freeway", "streets", "live", "private"];
    return ["all", ...ordered.filter((g) => present.has(g as Exclude<GroupFilter, "all">))];
  }, [cameras]);

  const groupCounts = useMemo(() => {
    const map: Record<GroupFilter, number> = {
      all: cameras.length,
      freeway: 0,
      streets: 0,
      live: 0,
      private: 0,
    };
    for (const c of cameras) {
      map[cameraGroup(c.source ?? "caltrans")] += 1;
    }
    return map;
  }, [cameras]);

  const routes = useMemo(() => {
    const set = new Set<string>();
    for (const c of cameras) set.add(c.route);
    return ["ALL", ...Array.from(set).sort()];
  }, [cameras]);

  // Base filters (route/group/search) — stable across status changes so the
  // grid's anchor cameras don't reshuffle each time a tile flips to offline.
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cameras
      .filter((c) => group === "all" || cameraGroup(c.source ?? "caltrans") === group)
      .filter((c) => route === "ALL" || c.route === route)
      .filter(
        (c) =>
          !q ||
          c.description.toLowerCase().includes(q) ||
          c.route.toLowerCase().includes(q),
      );
  }, [cameras, group, route, query]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3 border border-neutral-200 px-3 py-2">
        {availableGroups.length > 2 && (
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Group
            </span>
            <div className="flex">
              {availableGroups.map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => setGroup(opt)}
                  className={cn(
                    "h-7 border border-neutral-200 px-2 font-mono text-xs uppercase",
                    group === opt
                      ? "border-black bg-black text-white"
                      : "bg-white text-black hover:border-black",
                    i > 0 && "border-l-0",
                  )}
                  title={`${GROUP_LABEL[opt]} · ${groupCounts[opt]}`}
                >
                  {GROUP_LABEL[opt]}
                  <span
                    className={cn(
                      "ml-1 text-[9px]",
                      group === opt ? "text-white/70" : "text-neutral-400",
                    )}
                  >
                    {groupCounts[opt]}
                  </span>
                </button>
              ))}
            </div>
          </label>
        )}

        <RouteCombobox
          value={route}
          options={routes}
          onChange={setRoute}
        />

        <label className="flex flex-1 items-center gap-2 sm:ml-auto sm:flex-none">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="street / route"
            className="h-7 w-full min-w-0 border border-neutral-200 bg-white px-2 font-mono text-xs placeholder:text-neutral-300 focus:border-black focus:outline-none sm:w-56"
          />
        </label>

        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {baseFiltered.length} shown · {cameras.length} total
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {baseFiltered.map((c) => (
          <CameraTile key={c.id} camera={c} />
        ))}
      </div>

      {baseFiltered.length === 0 && (
        <p className="border border-dashed border-neutral-200 p-12 text-center font-mono text-xs text-neutral-500">
          No cameras match these filters.
        </p>
      )}

    </div>
  );
}
