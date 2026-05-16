"use client";

import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";

/**
 * Chrome-less live camera player. Same lazy-HLS / MJPEG-refresh logic as
 * `CameraTile`, stripped down for reuse in feeds and detail pages.
 *
 * - hls.js is dynamically imported only when this component is in-view
 * - MJPEG refreshes every 5s
 * - HLS goes through /api/hls CORS proxy
 * - No badge/status chrome — caller controls the frame
 *
 * Use cases:
 *   - tiny 96×54 thumbnail on /openclaw rows (autoplay, muted)
 *   - full aspect-video on /incidents/[id] when no clip is stored
 */

interface Props {
  streamUrl: string;
  streamType: "hls" | "mjpeg";
  /** Tailwind classes — container fully controls size + aspect ratio. */
  className?: string;
  /** True (default): only attach stream when scrolled into view. */
  lazy?: boolean;
  /** Show a low-volume status dot in the top-right? */
  showLiveDot?: boolean;
}

const MJPEG_REFRESH_MS = 5_000;
const HLS_LOAD_TIMEOUT_MS = 8_000;

export function LiveStream({
  streamUrl,
  streamType,
  className = "",
  lazy = true,
  showLiveDot = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [inView, setInView] = useState(!lazy);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "offline">(
    "idle",
  );

  useEffect(() => {
    if (!lazy || !containerRef.current) return;
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
  }, [lazy]);

  useEffect(() => {
    if (!inView || streamType !== "hls" || !videoRef.current) return;
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

    const proxied = `/api/hls?url=${encodeURIComponent(streamUrl)}`;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxied;
      video.addEventListener("loadedmetadata", markLive);
      video.addEventListener("error", markOffline);
      video.play().catch(() => {});
    } else {
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
  }, [inView, streamUrl, streamType]);

  useEffect(() => {
    if (!inView || streamType !== "mjpeg") return;
    setStatus("loading");
    setImgSrc(`${streamUrl}?t=${Date.now()}`);
    const interval = setInterval(() => {
      setImgSrc(`${streamUrl}?t=${Date.now()}`);
    }, MJPEG_REFRESH_MS);
    return () => clearInterval(interval);
  }, [inView, streamUrl, streamType]);

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (img.naturalWidth === 320 && img.naturalHeight === 240) {
      setStatus("offline");
      return;
    }
    setStatus("live");
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-black ${className}`}
    >
      {inView && streamType === "hls" && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      )}
      {inView && streamType === "mjpeg" && imgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="live camera"
          src={imgSrc}
          onLoad={handleImgLoad}
          onError={() => setStatus("offline")}
          className="h-full w-full object-cover"
        />
      )}
      {showLiveDot && (
        <span
          aria-hidden
          className={`pointer-events-none absolute right-1 top-1 inline-block h-1.5 w-1.5 rounded-full ${
            status === "live"
              ? "bg-green-400"
              : status === "loading"
                ? "bg-neutral-300 animate-pulse"
                : "bg-neutral-500"
          }`}
        />
      )}
      {status === "offline" && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80 font-mono text-[8px] uppercase tracking-widest text-neutral-400">
          offline
        </div>
      )}
    </div>
  );
}
