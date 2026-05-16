"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
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

interface Props {
  camera: CameraTileData;
}

const MJPEG_REFRESH_MS = 5000;

export function CameraTile({ camera }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [imgSrc, setImgSrc] = useState<string>(() =>
    camera.streamType === "mjpeg" ? `${camera.streamUrl}?t=${Date.now()}` : "",
  );
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");

  useEffect(() => {
    if (camera.streamType !== "hls" || !videoRef.current) return;

    const video = videoRef.current;
    let hls: Hls | null = null;
    let cancelled = false;

    const onLoaded = () => {
      if (!cancelled) setStatus("live");
    };
    const onError = () => {
      if (!cancelled) setStatus("error");
    };

    if (Hls.isSupported()) {
      hls = new Hls({ liveDurationInfinity: true, lowLatencyMode: true });
      hls.loadSource(camera.streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, onLoaded);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) onError();
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = camera.streamUrl;
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
    } else {
      setStatus("error");
    }

    video.play().catch(() => {});

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [camera.streamUrl, camera.streamType]);

  useEffect(() => {
    if (camera.streamType !== "mjpeg") return;
    const interval = setInterval(() => {
      setImgSrc(`${camera.streamUrl}?t=${Date.now()}`);
    }, MJPEG_REFRESH_MS);
    return () => clearInterval(interval);
  }, [camera.streamUrl, camera.streamType]);

  const dot =
    status === "live" ? "bg-black" : status === "error" ? "bg-neutral-300" : "bg-neutral-400";

  return (
    <div className="relative flex aspect-video flex-col overflow-hidden border border-neutral-200 bg-black">
      {camera.streamType === "hls" ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full bg-black object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt={camera.description}
          onLoad={() => setStatus("live")}
          onError={() => setStatus("error")}
          className="h-full w-full bg-black object-cover"
        />
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
