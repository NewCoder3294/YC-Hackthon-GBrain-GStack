"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { thumbnailUrl } from "./thumbnail-url";

interface Props {
  path: string | null | undefined;
  className?: string;
  aspect?: "tile" | "video";
  label?: string;
  fallbackStreamUrl?: string | null;
  fallbackStreamType?: "hls" | "mjpeg" | null;
  showLiveDot?: boolean;
}

export function ClipThumbnail({
  path,
  className,
  aspect = "tile",
  label,
  fallbackStreamUrl,
  fallbackStreamType,
  showLiveDot = false,
}: Props) {
  const clipUrl = path ? thumbnailUrl(path) : "";
  const liveUrl =
    fallbackStreamType === "mjpeg" && fallbackStreamUrl
      ? fallbackStreamUrl
      : "";

  const [clipLoaded, setClipLoaded] = useState(false);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const clipRef = useRef<HTMLImageElement | null>(null);
  const liveRef = useRef<HTMLImageElement | null>(null);
  const aspectCls =
    aspect === "video" ? "aspect-video w-full" : "h-12 w-20";

  const setClipNode = useCallback((node: HTMLImageElement | null) => {
    clipRef.current = node;
    if (node?.complete && node.naturalWidth > 0) {
      setClipLoaded(true);
    } else {
      setClipLoaded(false);
    }
  }, []);

  const setLiveNode = useCallback((node: HTMLImageElement | null) => {
    liveRef.current = node;
    if (node?.complete && node.naturalWidth > 0) {
      setLiveLoaded(true);
    } else {
      setLiveLoaded(false);
    }
  }, []);

  useEffect(() => {
    if (!clipUrl) setClipLoaded(false);
  }, [clipUrl]);

  useEffect(() => {
    if (!liveUrl) setLiveLoaded(false);
  }, [liveUrl]);

  const showLive = !clipLoaded && !!liveUrl && liveLoaded;

  return (
    <div
      className={`relative overflow-hidden border border-neutral-200 bg-neutral-50 ${aspectCls} ${className ?? ""}`}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity ${
          clipLoaded || showLive ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden={clipLoaded || showLive}
      >
        <Placeholder small={aspect === "tile"} label={label} />
      </div>

      {liveUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={setLiveNode}
          src={liveUrl}
          alt=""
          onLoad={() => setLiveLoaded(true)}
          onError={() => setLiveLoaded(false)}
          className={`absolute inset-0 h-full w-full object-cover grayscale transition-opacity ${
            showLive ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {clipUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={setClipNode}
          src={clipUrl}
          alt=""
          onLoad={() => setClipLoaded(true)}
          onError={() => setClipLoaded(false)}
          className={`absolute inset-0 h-full w-full object-cover grayscale transition-opacity ${
            clipLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {showLive && showLiveDot && (
        <span
          aria-label="Live feed"
          className="absolute right-1.5 top-1.5 flex items-center gap-1 bg-black/80 px-1 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
      )}
    </div>
  );
}

function Placeholder({
  small,
  label,
}: {
  small: boolean;
  label?: string | undefined;
}) {
  const size = small ? 14 : 28;
  return (
    <div className="flex flex-col items-center gap-1 text-neutral-300">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden
      >
        <rect x="3" y="6" width="14" height="12" />
        <path d="M17 10l4-2v8l-4-2z" />
      </svg>
      {label && !small && (
        <span className="font-mono text-[10px] uppercase tracking-widest">
          {label}
        </span>
      )}
    </div>
  );
}
