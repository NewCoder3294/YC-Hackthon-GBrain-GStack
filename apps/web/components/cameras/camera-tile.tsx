"use client";

import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { cn } from "@/lib/utils";

export interface CameraTileData {
  id: string;
  caltransId: string;
  route: string;
  direction: string | null;
  description: string;
  streamUrl: string;
  streamType: "hls" | "mjpeg";
  isActive: boolean;
}

export type CameraStatus = "idle" | "loading" | "live" | "offline";

interface Props {
  camera: CameraTileData;
  onStatusChange?: (status: CameraStatus) => void;
}

const MJPEG_REFRESH_MS = 5000;
const HLS_LOAD_TIMEOUT_MS = 8000;

export function CameraTile({ camera, onStatusChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [inView, setInView] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);

  // Lazy-attach: only mount stream when scrolled into view
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // HLS attach — hls.js is dynamically imported so the ~150 KB bundle
  // doesn't block first paint of the wall.
  useEffect(() => {
    if (!inView || camera.streamType !== "hls" || !videoRef.current) return;
    const video = videoRef.current;
    let hls: Hls | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    setStatus("loading");
    timer = setTimeout(() => {
      if (!cancelled) setStatus("offline");
    }, HLS_LOAD_TIMEOUT_MS);

    const markLive = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      setStatus("live");
    };
    const markOffline = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      setStatus("offline");
    };

    const proxied = `/api/hls?url=${encodeURIComponent(camera.streamUrl)}`;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari path — native HLS, no library needed.
      video.src = proxied;
      video.addEventListener("loadedmetadata", markLive);
      video.addEventListener("error", markOffline);
      video.play().catch(() => {});
    } else {
      // Other browsers — load hls.js lazily.
      import("hls.js")
        .then(({ default: HlsLib }) => {
          if (cancelled) return;
          if (!HlsLib.isSupported()) {
            markOffline();
            return;
          }
          hls = new HlsLib({ lowLatencyMode: true, maxBufferLength: 4 });
          hls.loadSource(proxied);
          hls.attachMedia(video);
          hls.on(HlsLib.Events.MANIFEST_PARSED, markLive);
          hls.on(HlsLib.Events.FRAG_LOADED, markLive);
          hls.on(HlsLib.Events.ERROR, (_e, data) => {
            if (data.fatal) markOffline();
          });
          video.play().catch(() => {});
        })
        .catch(() => {
          if (!cancelled) markOffline();
        });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      hls?.destroy();
    };
  }, [inView, camera.streamUrl, camera.streamType]);

  // MJPEG refresh
  useEffect(() => {
    if (!inView || camera.streamType !== "mjpeg") return;
    setStatus("loading");
    setImgSrc(`${camera.streamUrl}?t=${Date.now()}`);
    const interval = setInterval(() => {
      setImgSrc(`${camera.streamUrl}?t=${Date.now()}`);
    }, MJPEG_REFRESH_MS);
    return () => clearInterval(interval);
  }, [inView, camera.streamUrl, camera.streamType]);

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    // CalTrans "Temporarily Unavailable" placeholder is exactly 320×240
    // Real feeds are 352×240 / 720×480 / 1280×720. Reject the placeholder size.
    if (img.naturalWidth === 320 && img.naturalHeight === 240) {
      setStatus("offline");
      return;
    }
    setStatus("live");
  }

  const dot =
    status === "live"
      ? "bg-black"
      : status === "loading"
        ? "bg-neutral-400"
        : status === "offline"
          ? "bg-neutral-300"
          : "bg-neutral-200";

  return (
    <div
      ref={containerRef}
      className="relative flex aspect-video flex-col overflow-hidden border border-neutral-200 bg-black"
    >
      {inView && camera.streamType === "hls" && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full bg-black object-cover"
        />
      )}

      {inView && camera.streamType === "mjpeg" && imgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imgSrc}
          src={imgSrc}
          alt={camera.description}
          onLoad={handleImgLoad}
          onError={() => setStatus("offline")}
          className={cn(
            "h-full w-full bg-black object-cover transition-opacity",
            status === "live" ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {(status === "offline" || (status === "loading" && inView)) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {status === "offline" ? "No Signal" : "Connecting…"}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              dot,
              status === "live" && "animate-pulse",
            )}
          />
          <span className="truncate font-mono text-[10px] uppercase tracking-widest text-white">
            {camera.route}
            {camera.direction ? ` ${camera.direction}` : ""}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-white/70">
          {camera.streamType}
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <p className="truncate font-mono text-[11px] text-white">{camera.description}</p>
      </div>
    </div>
  );
}
