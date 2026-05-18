"use client";

import { useSearchParams } from "next/navigation";
import { isFilterEmpty, decodeFilter } from "@/lib/map/filter";

/**
 * Top-right floating download buttons for CSV / GeoJSON export. Only
 * renders once a filter is set so the export reflects something
 * meaningful (rather than 750 rows of "everything in last 24h").
 */
export function MapExportButtons() {
  const params = useSearchParams();
  const filter = decodeFilter(params);
  if (isFilterEmpty(filter)) return null;

  const baseQs = params.toString();
  const csvHref = `/api/map/export?${baseQs ? baseQs + "&" : ""}format=csv`;
  const gjHref = `/api/map/export?${baseQs ? baseQs + "&" : ""}format=geojson`;

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-1.5 border border-neutral-300 bg-white/95 px-2 py-1 backdrop-blur">
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        Export
      </span>
      <a
        href={csvHref}
        download
        className="border border-neutral-300 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest hover:border-black hover:bg-black hover:text-white"
      >
        CSV
      </a>
      <a
        href={gjHref}
        download
        className="border border-neutral-300 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest hover:border-black hover:bg-black hover:text-white"
      >
        GeoJSON
      </a>
    </div>
  );
}
