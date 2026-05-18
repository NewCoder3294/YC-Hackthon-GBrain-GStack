"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { cn } from "@/lib/utils";

/**
 * Lasso / polygon draw tool. Wraps @mapbox/mapbox-gl-draw bound to the
 * MapLibre instance via the standard `addControl` pattern (MapboxDraw works
 * on MapLibre as long as we declare its sources/layers ourselves OR use the
 * official @mapbox/mapbox-gl-draw 1.4+ which is compatible).
 *
 * Live count panel shows aggregations of whatever points the parent passes
 * in via `inside` (already filtered by point-in-polygon). All math stays in
 * the parent so this component is pure UI.
 */

export interface PolygonAggregations {
  total: number;
  bySeverity: Record<string, number>;
  bySource: Record<string, number>;
  topCrimeTypes: Array<{ type: string; count: number }>;
}

interface Props {
  map: MlMap | null;
  active: boolean;
  onActiveChange: (active: boolean) => void;
  polygon: Array<[number, number]> | null;
  onPolygonChange: (polygon: Array<[number, number]> | null) => void;
  aggregations: PolygonAggregations | null;
}

export function PolygonDraw({
  map,
  active,
  onActiveChange,
  polygon,
  onPolygonChange,
  aggregations,
}: Props) {
  const drawRef = useRef<unknown>(null);
  const [drawError, setDrawError] = useState<string | null>(null);

  // Lazy-load @mapbox/mapbox-gl-draw on demand. Falls back to a "lasso
  // unavailable" message if the dep isn't installed yet so the page never
  // hard-crashes during the install/build cycle.
  useEffect(() => {
    if (!map || !active) return;
    let cancelled = false;
    let DrawCtor: any;
    (async () => {
      try {
        const mod = await import("@mapbox/mapbox-gl-draw");
        DrawCtor = mod.default ?? mod;
        // CSS — best-effort; some bundlers tree-shake side-effect imports.
        try {
          await import(
            "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css" as string
          );
        } catch {
          /* css optional */
        }
      } catch (err) {
        if (!cancelled) {
          setDrawError(
            "lasso unavailable — install @mapbox/mapbox-gl-draw",
          );
        }
        return;
      }
      if (cancelled) return;

      const draw = new DrawCtor({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        defaultMode: "draw_polygon",
        styles: monochromeDrawStyles,
      });
      drawRef.current = draw;
      try {
        // MapLibre's addControl accepts the same interface as Mapbox controls
        // for plain controls; MapboxDraw stores the map handle internally.
        (map as unknown as { addControl: (c: unknown) => void }).addControl(
          draw,
        );
      } catch (err) {
        setDrawError("could not attach draw control to map");
        return;
      }

      const sync = () => {
        const fc = draw.getAll();
        const feat = fc.features.find(
          (f: { geometry: { type: string } }) =>
            f.geometry.type === "Polygon",
        );
        if (!feat) {
          onPolygonChange(null);
          return;
        }
        const ring = (feat.geometry as { coordinates: number[][][] })
          .coordinates[0];
        if (!ring || ring.length < 4) {
          onPolygonChange(null);
          return;
        }
        // Drop the closing point (mapbox-draw repeats first as last).
        const pts: Array<[number, number]> = ring
          .slice(0, -1)
          .map((p) => [p[0], p[1]] as [number, number]);
        onPolygonChange(pts);
      };

      map.on("draw.create", sync);
      map.on("draw.update", sync);
      map.on("draw.delete", () => onPolygonChange(null));

      return () => {
        try {
          (map as unknown as { off: (e: string, h: () => void) => void }).off(
            "draw.create",
            sync,
          );
          (map as unknown as { off: (e: string, h: () => void) => void }).off(
            "draw.update",
            sync,
          );
          (
            map as unknown as { removeControl: (c: unknown) => void }
          ).removeControl(draw);
        } catch {
          /* ignore teardown errors */
        }
        drawRef.current = null;
      };
    })();
    return () => {
      cancelled = true;
    };
  }, [map, active, onPolygonChange]);

  // When user disables lasso mode, clear the existing polygon.
  useEffect(() => {
    if (active) return;
    if (
      drawRef.current &&
      typeof (drawRef.current as { deleteAll?: () => void }).deleteAll ===
        "function"
    ) {
      (drawRef.current as { deleteAll: () => void }).deleteAll();
    }
  }, [active]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col gap-2 rounded-md border border-neutral-300 bg-white/95 p-3 font-mono text-[10px] uppercase tracking-wider text-neutral-700 shadow-sm backdrop-blur",
      )}
      role="region"
      aria-label="Polygon lasso tool"
    >
      <button
        type="button"
        onClick={() => onActiveChange(!active)}
        aria-pressed={active}
        className={cn(
          "rounded-sm border px-2 py-1 transition-colors",
          active
            ? "border-neutral-900 bg-neutral-900 text-white"
            : "border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50",
        )}
      >
        {active ? "drawing… click to finish" : "lasso area"}
      </button>
      {drawError && (
        <div className="text-[9px] normal-case tracking-normal text-red-600">
          {drawError}
        </div>
      )}
      {polygon && aggregations && (
        <div className="flex flex-col gap-1.5 border-t border-neutral-200 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">signals inside</span>
            <span className="tabular-nums text-neutral-900">
              {aggregations.total}
            </span>
          </div>
          {Object.keys(aggregations.bySeverity).length > 0 && (
            <div>
              <div className="text-[9px] text-neutral-500">severity</div>
              {Object.entries(aggregations.bySeverity)
                .sort((a, b) => b[1] - a[1])
                .map(([sev, n]) => (
                  <div
                    key={sev}
                    className="flex items-center justify-between text-[9px]"
                  >
                    <span className="text-neutral-700">{sev}</span>
                    <span className="tabular-nums text-neutral-900">{n}</span>
                  </div>
                ))}
            </div>
          )}
          {Object.keys(aggregations.bySource).length > 0 && (
            <div>
              <div className="text-[9px] text-neutral-500">source</div>
              {Object.entries(aggregations.bySource)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([src, n]) => (
                  <div
                    key={src}
                    className="flex items-center justify-between text-[9px]"
                  >
                    <span className="text-neutral-700">{src}</span>
                    <span className="tabular-nums text-neutral-900">{n}</span>
                  </div>
                ))}
            </div>
          )}
          {aggregations.topCrimeTypes.length > 0 && (
            <div>
              <div className="text-[9px] text-neutral-500">top types</div>
              {aggregations.topCrimeTypes.slice(0, 5).map((t) => (
                <div
                  key={t.type}
                  className="flex items-center justify-between text-[9px]"
                >
                  <span className="text-neutral-700">{t.type}</span>
                  <span className="tabular-nums text-neutral-900">
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Monochrome styles for mapbox-gl-draw to match WatchDog's aesthetic.
const monochromeDrawStyles = [
  {
    id: "gl-draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint: { "fill-color": "#171717", "fill-opacity": 0.1 },
  },
  {
    id: "gl-draw-polygon-stroke",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#171717", "line-width": 2 },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-halo",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: { "circle-radius": 5, "circle-color": "#ffffff" },
  },
  {
    id: "gl-draw-polygon-and-line-vertex",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: { "circle-radius": 3, "circle-color": "#171717" },
  },
];
