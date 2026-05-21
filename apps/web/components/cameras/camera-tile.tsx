"use client";

import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { cn } from "@/lib/utils";

export type CameraSource =
  | "caltrans"
  | "curated"
  | "sfmta"
  | "windy"
  | "contributor"
  | "demo";

export interface CameraTileData {
  id: string;
  caltransId: string;
  route: string;
  direction: string | null;
  description: string;
  streamUrl: string;
  streamType: "hls" | "mjpeg" | "iframe";
  stillImageUrl?: string | null;
  hlsUrl?: string | null;
  isActive: boolean;
  source?: CameraSource;
}

export type CameraStatus = "idle" | "loading" | "live" | "offline";

interface Props {
  camera: CameraTileData;
  onStatusChange?: (status: CameraStatus) => void;
}

const MJPEG_REFRESH_MS = 5000;
const HLS_LOAD_TIMEOUT_MS = 10_000;
const HLS_FATAL_RETRY_LIMIT = 3;
const HLS_FATAL_RETRY_DELAY_MS = 1200;
// Structural-failure window: if the decoder never produced a real frame
// (no width/height, never reached readyState>=2) by this deadline after
// going "live", treat as offline. Pure pixel sampling is too noisy
// (foggy / night / blank pavement looks blank but is a real feed).
const STRUCTURAL_CHECK_MS = 10_000;

function withCacheBuster(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

export function CameraTile({ camera, onStatusChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stillLiveRef = useRef(false);
  const stillFailedRef = useRef(false);
  const [inView, setInView] = useState(false);
  const [videoLive, setVideoLive] = useState(false);
  const [stillLive, setStillLive] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const liveStreamUrl = camera.hlsUrl ?? camera.streamUrl;
  const streamType = camera.hlsUrl ? "hls" : camera.streamType;
  const streamUrl = streamType === "hls" ? liveStreamUrl : camera.streamUrl;
  const stillUrl =
    camera.stillImageUrl ?? (streamType === "mjpeg" ? streamUrl : null);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);

  useEffect(() => {
    stillLiveRef.current = stillLive;
  }, [stillLive]);

  useEffect(() => {
    stillFailedRef.current = stillFailed;
  }, [stillFailed]);

  useEffect(() => {
    setVideoLive(false);
    setStillLive(false);
    setStillFailed(false);
    setImgSrc(null);
    setStatus("idle");
  }, [camera.id, camera.streamUrl, camera.hlsUrl]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(Boolean(entry?.isIntersecting));
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // HLS attach — hls.js is dynamically imported so the ~150 KB bundle
  // doesn't block first paint of the wall.
  useEffect(() => {
    if (!inView || streamType !== "hls" || !videoRef.current) return;
    const video = videoRef.current;
    let hls: Hls | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let frameCallback = 0;

    setVideoLive(false);
    if (!stillLive) setStatus("loading");
    timer = setTimeout(() => {
      if (!cancelled) markOffline();
    }, HLS_LOAD_TIMEOUT_MS);

    let structuralTimer: ReturnType<typeof setTimeout> | null = null;
    let liveOnce = false;
    const scheduleStructuralCheck = () => {
      structuralTimer = setTimeout(() => {
        if (cancelled || !videoRef.current) return;
        const v = videoRef.current;
        const noDims = v.videoWidth === 0 || v.videoHeight === 0;
        const noReady = v.readyState < 2;
        if (noDims || noReady) markOffline();
      }, STRUCTURAL_CHECK_MS);
    };

    const markLive = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      fatalErrorCount = 0;
      setVideoLive(true);
      setStatus("live");
      if (video.paused) {
        video.play().catch(() => {});
      }
      if (!liveOnce) {
        liveOnce = true;
        scheduleStructuralCheck();
      }
    };
    const markLiveWhenFrameDecodes = () => {
      if (cancelled) return;
      const frameVideo = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number;
      };
      if (frameVideo.requestVideoFrameCallback) {
        frameCallback = frameVideo.requestVideoFrameCallback(markLive);
        return;
      }
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        markLive();
      }
    };
    const markOffline = () => {
      if (cancelled) return;
      if (liveOnce) {
        video.play().catch(() => {});
        return;
      }
      if (timer) clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      setVideoLive(false);
      if (stillLiveRef.current) {
        setStatus("live");
        return;
      }
      if (stillUrl && !stillFailedRef.current) {
        setStatus("loading");
        return;
      }
      setStatus("offline");
    };

    const proxied = `/api/hls?url=${encodeURIComponent(streamUrl)}`;
    let fatalErrorCount = 0;
    const retryFatal = (recover: () => void) => {
      if (cancelled) return;
      fatalErrorCount += 1;
      if (fatalErrorCount > HLS_FATAL_RETRY_LIMIT) {
        fatalErrorCount = 0;
        markOffline();
        return;
      }
      if (!liveOnce && !stillLiveRef.current) setStatus("loading");
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (!cancelled) {
          if (liveOnce) video.play().catch(() => {});
          recover();
        }
      }, HLS_FATAL_RETRY_DELAY_MS * fatalErrorCount);
    };

    video.addEventListener("loadeddata", markLiveWhenFrameDecodes);
    video.addEventListener("playing", markLiveWhenFrameDecodes);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari path — native HLS, no library needed.
      video.src = proxied;
      video.addEventListener("loadedmetadata", markLiveWhenFrameDecodes);
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
          hls.on(HlsLib.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) {
              retryFatal(() => hls?.startLoad());
              return;
            }
            if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
              retryFatal(() => hls?.recoverMediaError());
              return;
            }
            retryFatal(() => hls?.startLoad());
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
      if (retryTimer) clearTimeout(retryTimer);
      if (structuralTimer) clearTimeout(structuralTimer);
      const frameVideo = video as HTMLVideoElement & {
        cancelVideoFrameCallback?: (handle: number) => void;
      };
      if (frameCallback && frameVideo.cancelVideoFrameCallback) {
        frameVideo.cancelVideoFrameCallback(frameCallback);
      }
      video.removeEventListener("loadeddata", markLiveWhenFrameDecodes);
      video.removeEventListener("playing", markLiveWhenFrameDecodes);
      video.removeEventListener("loadedmetadata", markLiveWhenFrameDecodes);
      hls?.destroy();
    };
  }, [inView, streamUrl, streamType, stillUrl]);

  // Still-frame refresh. HLS cameras keep this as a stable background while
  // the live video attaches; MJPEG-only cameras use it as their main feed.
  useEffect(() => {
    if (!inView || !stillUrl || stillFailed) return;
    if (!stillLive && !videoLive) setStatus("loading");
    setImgSrc(withCacheBuster(stillUrl));
    const interval = setInterval(() => {
      setImgSrc(withCacheBuster(stillUrl));
    }, MJPEG_REFRESH_MS);
    return () => clearInterval(interval);
  }, [inView, stillUrl, stillFailed, stillLive, videoLive]);

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    // CalTrans "Temporarily Unavailable" placeholder is exactly 320×240.
    // Real feeds are 352×240 / 720×480 / 1280×720.
    if (img.naturalWidth === 320 && img.naturalHeight === 240) {
      setStillLive(false);
      if (!videoLive) setStatus("offline");
      return;
    }
    setStillFailed(false);
    setStillLive(true);
    setStatus("live");
  }

  function handleImgError() {
    setStillFailed(true);
    setStillLive(false);
    if (!videoLive) setStatus("offline");
    setImgSrc(null);
  }

  // Camera status — monochrome shape/fill/motion, never hue.
  const dot =
    status === "live"
      ? "bg-white shadow-[0_0_4px_rgba(255,255,255,0.9)]"
      : status === "loading"
        ? "bg-neutral-400 animate-pulse"
        : status === "offline"
          ? "bg-neutral-700 ring-1 ring-white/40"
          : "bg-neutral-500";
  const showLoadingSurface = status !== "live";

  return (
    <div
      ref={containerRef}
      data-camera-tile=""
      data-camera-id={camera.id}
      data-camera-stream-type={streamType}
      data-camera-status={status}
      className="relative flex aspect-video flex-col overflow-hidden border border-neutral-200 bg-neutral-100"
    >
      {showLoadingSurface && (
        <div className="absolute inset-0 bg-neutral-100">
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(245,245,245,0.78),rgba(229,229,229,0.92),rgba(245,245,245,0.78))] bg-[length:220%_100%]" />
        </div>
      )}

      {inView && stillUrl && imgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imgSrc}
          src={imgSrc}
          alt={camera.description}
          onLoad={handleImgLoad}
          onError={handleImgError}
          className={cn(
            "h-full w-full bg-black object-cover transition-opacity duration-200",
            stillLive ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {inView && streamType === "hls" && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn(
            "absolute inset-0 h-full w-full bg-black object-cover transition-opacity duration-200",
            videoLive ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {inView && streamType === "iframe" && (
        // Embed cameras (e.g. Windy player.day pages). The loader is the
        // tile-internal status reporter; iframes give us no readyState
        // signal, so we treat any successful initial load as "live".
        <iframe
          src={camera.streamUrl}
          title={camera.description}
          onLoad={() => setStatus("live")}
          allow="autoplay; encrypted-media"
          referrerPolicy="no-referrer"
          className={cn(
            "h-full w-full bg-black transition-opacity duration-200",
            status === "live" ? "opacity-100" : "opacity-0",
          )}
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      )}

      {(status === "offline" || (status === "loading" && inView)) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="bg-white/80 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {status === "offline" ? "No signal" : "Loading camera"}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-2 py-1.5">
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
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <p className="truncate font-mono text-[11px] text-white">{camera.description}</p>
      </div>
    </div>
  );
}
