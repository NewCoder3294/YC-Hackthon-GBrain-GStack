"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  streamUrl: string;
  intervalMs?: number;
  className?: string;
  badgeLabel?: string;
}

export function LiveMjpeg({
  streamUrl,
  intervalMs = 2000,
  className,
  badgeLabel = "Live",
}: Props) {
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const visibleRef = useRef(true);

  useEffect(() => {
    const id = setInterval(() => {
      if (visibleRef.current) setTick((n) => n + 1);
    }, intervalMs);
    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);

  const sep = streamUrl.includes("?") ? "&" : "?";
  const url = `${streamUrl}${sep}t=${tick}`;

  const setNode = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={setNode}
        src={url}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
        className={`h-full w-full object-cover grayscale transition-opacity ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      <span
        aria-label={badgeLabel}
        className="absolute right-2 top-2 flex items-center gap-1 bg-black/80 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        {badgeLabel}
      </span>
    </div>
  );
}
