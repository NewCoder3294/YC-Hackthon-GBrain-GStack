"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MlMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CameraTileData } from "@/components/cameras/camera-tile";
import { CameraTile } from "@/components/cameras/camera-tile";
import { IncidentPanel } from "./incident-panel";
import { DispatchPanel } from "./dispatch-panel";
import { NewsPanel, type NewsIncidentRow } from "./news-panel";
import type { EnvSignalRow } from "@/lib/cockpit/environmental";
import { TopPriorityPanel } from "./top-priority-panel";
import { useEventStream } from "@/hooks/use-event-stream";
import { wdIncidents, type WdIncident, type WdSignal } from "@/lib/watchdog-fixtures";
import { isHighPriority, type DispatchCall } from "@/lib/dispatch";
import { useDispatchFeed } from "@/hooks/use-dispatch-feed";
import { cn } from "@/lib/utils";

type CamWithCoords = CameraTileData & { lat: number; lng: number };

interface Props {
  cameras: CamWithCoords[];
  newsIncidents?: NewsIncidentRow[];
  envSignals?: EnvSignalRow[];
}

// Single-glyph cue per env kind — colour and richer styling lives in CSS
// keyed on data-kind. Kept terse so the marker stays at the same footprint
// as the existing news/incident dots.
const ENV_KIND_GLYPH: Record<string, string> = {
  weather: "☁",
  aqi: "•",
  quake: "≈",
  aircraft: "✈",
  vessel: "⚓",
  transit: "T",
};

const SF_CENTER: [number, number] = [-122.4194, 37.7749];

// CARTO Positron — clean monochrome basemap, no API key required for low traffic.
const TILE_STYLE = {
  version: 8 as const,
  sources: {
    positron: {
      type: "raster" as const,
      tiles: [
        "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap · © CARTO",
    },
  },
  layers: [{ id: "positron", type: "raster" as const, source: "positron" }],
};

type StreamFilter = "all" | "hls" | "mjpeg";
type DispatchPriority = "all" | "high" | "routine";

const HIGH_PRIORITIES = new Set(["A", "B"]);

function callMatchesPriority(call: DispatchCall, filter: DispatchPriority): boolean {
  if (filter === "all") return true;
  const p = (call.priority ?? "").toUpperCase();
  if (filter === "high") return HIGH_PRIORITIES.has(p);
  return !HIGH_PRIORITIES.has(p);
}

const SIGNAL_GLYPH: Record<WdSignal["kind"], string> = {
  camera: "■",
  call_911: "▲",
  citizen_report: "●",
  shotspotter: "✦",
};

const SIGNAL_LABEL: Record<WdSignal["kind"], string> = {
  camera: "Camera",
  call_911: "911",
  citizen_report: "Citizen",
  shotspotter: "ShotSpotter",
};

function buildIncidentMarkerEl(): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "wd-incident-marker";
  const pulse = document.createElement("span");
  pulse.className = "wd-incident-pulse";
  const dot = document.createElement("span");
  dot.className = "wd-incident-dot";
  el.append(pulse, dot);
  return el;
}

function buildPopupEl(title: string, sub: string): HTMLDivElement {
  const root = document.createElement("div");
  const t = document.createElement("div");
  t.className = "font-mono text-[10px] uppercase tracking-widest";
  t.textContent = title;
  const s = document.createElement("div");
  s.className = "mt-0.5 font-mono text-[10px] text-neutral-500";
  s.textContent = sub;
  root.append(t, s);
  return root;
}

export function SFMap({
  cameras,
  newsIncidents = [],
  envSignals = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const incidentMarkersRef = useRef<maplibregl.Marker[]>([]);
  const signalMarkersRef = useRef<maplibregl.Marker[]>([]);
  const dispatchMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const newsMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const envMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);

  const [stream, setStream] = useState<StreamFilter>("all");
  const [showCameras, setShowCameras] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showSignals, setShowSignals] = useState(true);
  const [showDispatch, setShowDispatch] = useState(true);
  const [showNews, setShowNews] = useState(true);
  const [showEnv, setShowEnv] = useState(true);
  const [dispatchPriority, setDispatchPriority] = useState<DispatchPriority>("all");
  const [selectedCam, setSelectedCam] = useState<CamWithCoords | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<WdIncident | null>(null);
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchCall | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsIncidentRow | null>(null);

  const dispatch = useDispatchFeed();

  const locateOnMap = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [lng, lat], zoom: 14.5 });
  }, []);
  const filteredDispatch = useMemo(
    () => dispatch.calls.filter((c) => callMatchesPriority(c, dispatchPriority)),
    [dispatch.calls, dispatchPriority],
  );

  const filteredCams = useMemo(
    () => cameras.filter((c) => stream === "all" || c.streamType === stream),
    [cameras, stream],
  );

  const camsGeojson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: filteredCams.map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        properties: { id: c.id, route: c.route, streamType: c.streamType },
      })),
    }),
    [filteredCams],
  );

  // Latest geojson ref so the map's `load` handler can read the
  // most recent value even though it was bound on first render.
  const camsGeojsonRef = useRef<GeoJSON.FeatureCollection>(camsGeojson);
  useEffect(() => {
    camsGeojsonRef.current = camsGeojson;
  }, [camsGeojson]);

  // Init map once
  useEffect(() => {
    const node = containerRef.current;
    if (!node || mapRef.current) return;

    const map = new maplibregl.Map({
      container: node,
      style: TILE_STYLE,
      center: SF_CENTER,
      zoom: 10.5,
      maxBounds: [
        [-123.4, 36.7],
        [-121.3, 38.6],
      ],
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(node);

    map.on("load", () => {
      map.resize();

      // Cameras source + layers — seed with the geojson we have right now
      map.addSource("cams", {
        type: "geojson",
        data: camsGeojsonRef.current,
        cluster: true,
        clusterRadius: 38,
        clusterMaxZoom: 13,
      });

      map.addLayer({
        id: "cam-clusters",
        type: "circle",
        source: "cams",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#000000",
          "circle-radius": ["step", ["get", "point_count"], 10, 10, 14, 30, 18],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "cam-points",
        type: "circle",
        source: "cams",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "streamType"], "hls"],
            "#000000",
            "#737373",
          ],
          "circle-radius": 4,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        className: "wd-popup",
      });

      map.on("click", "cam-clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["cam-clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId == null) return;
        const source = map.getSource("cams") as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geom = features[0]?.geometry;
          if (geom && geom.type === "Point") {
            map.easeTo({ center: geom.coordinates as [number, number], zoom });
          }
        });
      });

      map.on("click", "cam-points", (e) => {
        const feat = e.features?.[0];
        if (!feat || feat.geometry.type !== "Point") return;
        const id = feat.properties?.id as string;
        const found = filteredRef.current.find((c) => c.id === id);
        if (found) {
          setSelectedCam(found);
          setSelectedIncident(null);
          setSelectedDispatch(null);
          map.easeTo({ center: feat.geometry.coordinates as [number, number], zoom: 14.5 });
        }
      });

      map.on("mousemove", "cam-points", (e) => {
        const feat = e.features?.[0];
        if (!feat || feat.geometry.type !== "Point") return;
        map.getCanvas().style.cursor = "pointer";
        const id = feat.properties?.id as string;
        const cam = filteredRef.current.find((c) => c.id === id);
        if (!cam) return;
        const title = `${cam.route}${cam.direction ? ` · ${cam.direction}` : ""}`;
        popup
          .setLngLat(feat.geometry.coordinates as [number, number])
          .setDOMContent(buildPopupEl(title, cam.description))
          .addTo(map);
      });
      map.on("mouseleave", "cam-points", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("mouseenter", "cam-clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "cam-clusters", () => (map.getCanvas().style.cursor = ""));

      // Incident + signal HTML markers
      for (const inc of wdIncidents) {
        const el = buildIncidentMarkerEl();
        el.dataset.severity = inc.severity;
        el.dataset.status = inc.status;
        el.setAttribute("aria-label", inc.title);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelectedIncident(inc);
          setSelectedCam(null);
          setSelectedDispatch(null);
          map.easeTo({ center: [inc.lng, inc.lat], zoom: 14.5 });
        });
        const marker = new maplibregl.Marker({ element: el }).setLngLat([inc.lng, inc.lat]).addTo(map);
        incidentMarkersRef.current.push(marker);

        for (const s of inc.signals) {
          const sigEl = document.createElement("div");
          sigEl.className = "wd-signal-marker";
          sigEl.dataset.kind = s.kind;
          sigEl.title = `${SIGNAL_LABEL[s.kind]} · ${s.label}`;
          sigEl.textContent = SIGNAL_GLYPH[s.kind];
          const sigMarker = new maplibregl.Marker({ element: sigEl, anchor: "center" })
            .setLngLat([s.lng, s.lat])
            .addTo(map);
          signalMarkersRef.current.push(sigMarker);
        }
      }

      setMapLoaded(true);
    });

    return () => {
      ro.disconnect();
      incidentMarkersRef.current.forEach((m) => m.remove());
      signalMarkersRef.current.forEach((m) => m.remove());
      dispatchMarkersRef.current.forEach((m) => m.remove());
      newsMarkersRef.current.forEach((m) => m.remove());
      incidentMarkersRef.current = [];
      signalMarkersRef.current = [];
      dispatchMarkersRef.current.clear();
      newsMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const filteredRef = useRef(filteredCams);
  useEffect(() => {
    filteredRef.current = filteredCams;
  }, [filteredCams]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("cams") as GeoJSONSource | undefined;
    if (src) src.setData(camsGeojson);
  }, [camsGeojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("cam-points")) return;
    const vis = showCameras ? "visible" : "none";
    map.setLayoutProperty("cam-points", "visibility", vis);
    map.setLayoutProperty("cam-clusters", "visibility", vis);
  }, [showCameras]);

  useEffect(() => {
    for (const m of incidentMarkersRef.current) {
      m.getElement().style.display = showIncidents ? "" : "none";
    }
  }, [showIncidents]);
  useEffect(() => {
    for (const m of signalMarkersRef.current) {
      m.getElement().style.display = showSignals ? "" : "none";
    }
  }, [showSignals]);

  // Live SF dispatch markers — diff-and-sync against the filtered list so
  // the priority filter directly drives which pins are on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const store = dispatchMarkersRef.current;
    const nextIds = new Set(filteredDispatch.map((c) => c.id));

    for (const [id, marker] of store) {
      if (!nextIds.has(id)) {
        marker.remove();
        store.delete(id);
      }
    }

    for (const call of filteredDispatch) {
      if (store.has(call.id)) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "wd-dispatch-marker";
      if (isHighPriority(call.priority)) el.classList.add("wd-dispatch-marker-high");
      el.dataset.priority = call.priority || "?";
      el.setAttribute("aria-label", `${call.callType} at ${call.address}`);
      el.title = `${call.priority || "?"} · ${call.callType} · ${call.address}`;
      // Inner span holds all visuals + hover transition. The outer button
      // is positioning-only so MapLibre's per-frame transform updates
      // (during pan/zoom) snap instantly instead of being interpolated by
      // a CSS transition on transform — which is what made the markers
      // appear to "float" away from their pinned location while panning.
      const inner = document.createElement("span");
      inner.className = "wd-dispatch-marker-inner";
      inner.textContent = call.priority?.toUpperCase() || "•";
      el.appendChild(inner);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSelectedDispatch(call);
        setSelectedCam(null);
        setSelectedIncident(null);
        map.easeTo({ center: [call.lng, call.lat], zoom: 14.5 });
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([call.lng, call.lat])
        .addTo(map);
      store.set(call.id, marker);
    }
  }, [filteredDispatch, mapLoaded]);

  // Dispatch visibility toggle.
  useEffect(() => {
    for (const [, m] of dispatchMarkersRef.current) {
      m.getElement().style.display = showDispatch ? "" : "none";
    }
  }, [showDispatch]);

  // News markers — geo-tagged historical news coverage of SF violent crime.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const store = newsMarkersRef.current;
    const nextIds = new Set(newsIncidents.map((n) => n.id));

    for (const [id, marker] of store) {
      if (!nextIds.has(id)) {
        marker.remove();
        store.delete(id);
      }
    }

    for (const news of newsIncidents) {
      if (store.has(news.id)) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "wd-news-marker";
      el.dataset.severity = news.severity;
      el.dataset.type = news.crimeType;
      el.setAttribute("aria-label", `${news.crimeType} — ${news.title}`);
      el.title = `${news.crimeType.toUpperCase()} · ${news.neighborhood ?? ""} · ${news.title}`;
      const inner = document.createElement("span");
      inner.className = "wd-news-marker-inner";
      el.appendChild(inner);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSelectedNews(news);
        setSelectedCam(null);
        setSelectedIncident(null);
        setSelectedDispatch(null);
        map.easeTo({ center: [news.lng, news.lat], zoom: 14.5 });
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([news.lng, news.lat])
        .addTo(map);
      store.set(news.id, marker);
    }
  }, [newsIncidents, mapLoaded]);

  useEffect(() => {
    for (const [, m] of newsMarkersRef.current) {
      m.getElement().style.display = showNews ? "" : "none";
    }
  }, [showNews]);

  // Env signals — weather alerts, AQI, quakes, aircraft, vessels, transit.
  // Diff-and-sync against the row set keyed on EnvSignalRow.id. Markers
  // carry data-kind + data-severity so CSS can style each kind. Rows
  // without lat/lng are skipped (e.g. the synthetic `sf-avg` PurpleAir
  // aggregate row).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const store = envMarkersRef.current;
    const placeable = envSignals.filter(
      (r) => r.lat != null && r.lng != null,
    );
    const nextIds = new Set(placeable.map((r) => r.id));

    for (const [id, marker] of store) {
      if (!nextIds.has(id)) {
        marker.remove();
        store.delete(id);
      }
    }

    for (const row of placeable) {
      if (store.has(row.id)) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "wd-env-marker";
      el.dataset.kind = row.kind;
      el.dataset.severity = row.severity;
      const labelBits = [row.kind.toUpperCase(), row.title];
      if (row.subtitle) labelBits.push(row.subtitle);
      el.setAttribute("aria-label", labelBits.join(" — "));
      el.title = labelBits.join(" · ");
      const inner = document.createElement("span");
      inner.className = "wd-env-marker-glyph";
      inner.textContent = ENV_KIND_GLYPH[row.kind] ?? "•";
      el.appendChild(inner);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        map.easeTo({ center: [row.lng!, row.lat!], zoom: 13.5 });
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([row.lng!, row.lat!])
        .addTo(map);
      store.set(row.id, marker);
    }
  }, [envSignals, mapLoaded]);

  useEffect(() => {
    for (const [, m] of envMarkersRef.current) {
      m.getElement().style.display = showEnv ? "" : "none";
    }
  }, [showEnv]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)", minHeight: 480 }}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%" }}
      />

      <div className="pointer-events-auto absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center gap-2 border border-neutral-200 bg-white px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Bay Area · D4
        </span>
        <Divider />
        <LayerToggle label="Cams" on={showCameras} onClick={() => setShowCameras((v) => !v)} />
        <LayerToggle
          label="Incidents"
          on={showIncidents}
          onClick={() => setShowIncidents((v) => !v)}
        />
        <LayerToggle label="Signals" on={showSignals} onClick={() => setShowSignals((v) => !v)} />
        <LayerToggle
          label="Dispatch"
          on={showDispatch}
          onClick={() => setShowDispatch((v) => !v)}
        />
        <LayerToggle label="News" on={showNews} onClick={() => setShowNews((v) => !v)} />
        <LayerToggle label="Env" on={showEnv} onClick={() => setShowEnv((v) => !v)} />
        <div className="flex">
          {(["all", "high", "routine"] as DispatchPriority[]).map((opt, i) => (
            <button
              key={opt}
              onClick={() => setDispatchPriority(opt)}
              disabled={!showDispatch}
              title={
                opt === "high"
                  ? "Priority A + B"
                  : opt === "routine"
                    ? "Priority C + E"
                    : "All dispatch priorities"
              }
              className={cn(
                "h-7 border border-neutral-200 px-2 font-mono text-[10px] uppercase tracking-widest",
                dispatchPriority === opt
                  ? "border-black bg-black text-white"
                  : "bg-white text-black hover:border-black",
                i > 0 && "border-l-0",
                !showDispatch && "opacity-40",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        <Divider />
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
        <button
          type="button"
          onClick={() => dispatch.setPaused(!dispatch.paused)}
          title={dispatch.paused ? "Resume feed" : "Pause feed"}
          className={cn(
            "h-7 border px-2 font-mono text-[10px] uppercase tracking-widest",
            dispatch.paused
              ? "border-black bg-white text-black"
              : "border-black bg-black text-white",
          )}
        >
          {dispatch.paused ? "Feed paused" : "Feed live"}
        </button>
        <span className="min-w-0 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {filteredCams.length} cams · {wdIncidents.length} incidents ·{" "}
          {filteredDispatch.length}/{dispatch.calls.length} dispatch ·{" "}
          {newsIncidents.length} news · {envSignals.length} env
          {dispatch.loading ? " (loading)" : ""}
          {dispatch.error ? ` · ${dispatch.error}` : ""}
        </span>
      </div>

      <div className="pointer-events-auto absolute bottom-6 left-4 z-10 flex flex-col gap-1 border border-neutral-200 bg-white px-3 py-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          Legend
        </span>
        <LegendRow swatch={<span className="h-2 w-2 rounded-full bg-black" />} label="Camera (HLS)" />
        <LegendRow
          swatch={<span className="h-2 w-2 rounded-full bg-neutral-500" />}
          label="Camera (MJPEG)"
        />
        <LegendRow
          swatch={
            <span className="relative h-3 w-3">
              <span className="absolute inset-0 rounded-full bg-black opacity-30" />
              <span className="absolute inset-[3px] rounded-full bg-black" />
            </span>
          }
          label="Incident (live)"
        />
        <LegendRow swatch={<span className="font-mono text-[10px]">■▲●✦</span>} label="Signals" />
        <LegendRow
          swatch={
            <span className="flex h-3 w-3 items-center justify-center rounded-full border border-black bg-white font-mono text-[8px] font-bold text-black">
              A
            </span>
          }
          label="Dispatch (SFGov · 2h)"
        />
        <LegendRow
          swatch={
            <span className="block h-2.5 w-2.5 rotate-45 border border-black bg-white" />
          }
          label="News (historical)"
        />
      </div>

      {selectedCam && (
        <aside className="absolute right-4 top-4 z-10 flex w-96 flex-col border border-neutral-200 bg-white">
          <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs uppercase tracking-widest">
                {selectedCam.route}
                {selectedCam.direction ? ` · ${selectedCam.direction}` : ""}
              </p>
              <p className="truncate font-mono text-[10px] text-neutral-500">
                {selectedCam.description}
              </p>
            </div>
            <button
              onClick={() => setSelectedCam(null)}
              aria-label="close"
              className="font-mono text-xs text-neutral-500 hover:text-black"
            >
              ✕
            </button>
          </header>
          <div className="p-2">
            <CameraTile camera={selectedCam} />
          </div>
          <footer className="border-t border-neutral-200 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {selectedCam.lat.toFixed(4)}, {selectedCam.lng.toFixed(4)} · {selectedCam.streamType}
          </footer>
        </aside>
      )}
      {selectedIncident && (
        <IncidentPanel incident={selectedIncident} onClose={() => setSelectedIncident(null)} />
      )}
      {selectedDispatch && (
        <DispatchPanel
          key={selectedDispatch.id}
          call={selectedDispatch}
          onClose={() => setSelectedDispatch(null)}
        />
      )}
      {selectedNews && (
        <NewsPanel
          key={selectedNews.id}
          incident={selectedNews}
          onClose={() => setSelectedNews(null)}
        />
      )}


      <style jsx global>{`
        .wd-incident-marker {
          position: relative;
          width: 24px;
          height: 24px;
          padding: 0;
          background: transparent;
          border: 0;
          cursor: pointer;
        }
        .wd-incident-pulse {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: #000;
          opacity: 0.25;
          animation: wd-pulse 1.6s ease-out infinite;
        }
        .wd-incident-dot {
          position: absolute;
          inset: 7px;
          border-radius: 9999px;
          background: #000;
          border: 1.5px solid #fff;
          box-shadow: 0 0 0 1px #000;
        }
        .wd-incident-marker[data-severity="high"] .wd-incident-pulse {
          animation-duration: 1.1s;
          opacity: 0.4;
        }
        .wd-incident-marker[data-severity="med"] .wd-incident-pulse {
          opacity: 0.25;
        }
        .wd-incident-marker[data-severity="low"] .wd-incident-pulse {
          opacity: 0.15;
          animation-duration: 2.4s;
        }
        .wd-incident-marker[data-status="acted"] .wd-incident-dot,
        .wd-incident-marker[data-status="dismissed"] .wd-incident-dot {
          background: #fff;
          border-color: #000;
        }
        .wd-incident-marker[data-status="dismissed"] .wd-incident-pulse {
          display: none;
        }
        @keyframes wd-pulse {
          0% {
            transform: scale(0.6);
            opacity: 0.5;
          }
          80% {
            transform: scale(1.6);
            opacity: 0;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
        .wd-signal-marker {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border: 1px solid #000;
          background: #fff;
          font-family: var(--font-mono);
          font-size: 10px;
          line-height: 1;
          color: #000;
          pointer-events: none;
        }
        .wd-signal-marker[data-kind="camera"] {
          background: #000;
          color: #fff;
        }
        /* Outer button: positioning only. MapLibre rewrites this
           element's transform every animation frame during pan/zoom, so
           NOTHING on this selector is allowed to transition or animate
           the transform property. Otherwise the marker visibly lags
           behind its pinned coordinate. */
        .wd-dispatch-marker {
          display: block;
          padding: 0;
          margin: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          line-height: 0;
          width: 20px;
          height: 20px;
        }
        /* Inner span: all the visuals + hover scale live here. MapLibre
           never touches this element, so transform transitions are safe. */
        .wd-dispatch-marker-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          border: 2px solid #fff;
          background: #000;
          color: #fff;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          box-shadow: 0 0 0 1px #000;
          transition: transform 120ms ease;
          will-change: transform;
        }
        .wd-dispatch-marker:hover .wd-dispatch-marker-inner {
          transform: scale(1.18);
        }
        .wd-dispatch-marker-high .wd-dispatch-marker-inner {
          animation: wd-dispatch-pulse 1.4s ease-in-out infinite;
        }
        @keyframes wd-dispatch-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 1px #000, 0 0 0 0 rgba(0, 0, 0, 0.45);
          }
          50% {
            box-shadow: 0 0 0 1px #000, 0 0 0 8px rgba(0, 0, 0, 0);
          }
        }
        @keyframes wd-bars {
          from {
            transform: scaleY(0.35);
          }
          to {
            transform: scaleY(1.1);
          }
        }
        .wd-popup .maplibregl-popup-content {
          padding: 6px 8px;
          border: 1px solid #e5e5e5;
          border-radius: 0;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
        }
        .wd-popup .maplibregl-popup-tip {
          display: none;
        }
        /* News markers — diamond outline, distinct from other layers. */
        .wd-news-marker {
          display: block;
          padding: 0;
          margin: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          line-height: 0;
          width: 16px;
          height: 16px;
        }
        .wd-news-marker-inner {
          display: block;
          width: 10px;
          height: 10px;
          margin: 3px;
          transform: rotate(45deg);
          background: #fff;
          border: 1.5px solid #000;
          transition: transform 120ms ease, background 120ms ease;
          will-change: transform;
        }
        .wd-news-marker[data-severity="high"] .wd-news-marker-inner {
          background: #000;
        }
        .wd-news-marker[data-severity="med"] .wd-news-marker-inner {
          background: #fff;
        }
        .wd-news-marker[data-severity="low"] .wd-news-marker-inner {
          background: #fff;
          border-color: #737373;
        }
        .wd-news-marker:hover .wd-news-marker-inner {
          transform: rotate(45deg) scale(1.25);
        }
        /* Env markers — small mono pill glyphs, kind in dataset. */
        .wd-env-marker {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          margin: 0;
          border: 1.25px solid #000;
          background: #fff;
          cursor: pointer;
          line-height: 1;
          width: 14px;
          height: 14px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 9px;
          color: #000;
          transition: transform 120ms ease, background 120ms ease;
          will-change: transform;
        }
        .wd-env-marker-glyph {
          display: block;
          line-height: 1;
        }
        .wd-env-marker[data-severity="high"] {
          background: #000;
          color: #fff;
        }
        .wd-env-marker[data-severity="med"] {
          background: #fff;
          border-color: #000;
        }
        .wd-env-marker[data-severity="low"] {
          background: #fff;
          border-color: #a3a3a3;
          color: #737373;
        }
        .wd-env-marker[data-kind="aircraft"] {
          border-radius: 0;
        }
        .wd-env-marker[data-kind="vessel"] {
          border-radius: 50%;
        }
        .wd-env-marker[data-kind="weather"],
        .wd-env-marker[data-kind="aqi"],
        .wd-env-marker[data-kind="quake"],
        .wd-env-marker[data-kind="transit"] {
          border-radius: 3px;
        }
        .wd-env-marker:hover {
          transform: scale(1.2);
        }
      `}</style>
    </div>
  );
}

function Divider() {
  return <span className="h-3 w-px bg-neutral-200" />;
}

function LayerToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 border px-2 font-mono text-xs uppercase",
        on
          ? "border-black bg-black text-white"
          : "border-neutral-200 bg-white text-neutral-500 hover:border-black hover:text-black",
      )}
    >
      <span className={cn("h-1.5 w-1.5", on ? "bg-white" : "bg-neutral-300")} />
      {label}
    </button>
  );
}

function LegendRow({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-3 w-3 items-center justify-center">{swatch}</span>
      <span className="font-mono text-[10px] text-neutral-700">{label}</span>
    </div>
  );
}
