"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isHighPriority, priorityLabel, type DispatchCall } from "@/lib/dispatch";

interface Props {
  call: DispatchCall;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.round(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function DispatchPanel({ call, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAudio = !!call.audioUrl;

  // Autoplay on open. Stop on unmount or call change.
  useEffect(() => {
    if (!hasAudio) return;
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    setPlaying(false);
    audio
      .play()
      .then(() => setPlaying(true))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "autoplay blocked";
        setError(msg);
      });
    return () => {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // ignored
      }
    };
  }, [call.audioUrl, hasAudio]);

  const replay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio
      .play()
      .then(() => setPlaying(true))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "play failed");
      });
  };

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
  };

  return (
    <aside className="absolute right-4 top-4 z-10 flex max-h-[calc(100vh-7rem)] w-[420px] flex-col overflow-hidden border border-neutral-200 bg-white">
      <header className="flex items-start justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PriorityChip priority={call.priority} />
            <p className="truncate font-mono text-xs uppercase tracking-widest">
              {call.callTypeCode ? `${call.callTypeCode} · ` : ""}
              {call.callType}
            </p>
          </div>
          <p className="mt-1 font-mono text-[10px] text-neutral-500">
            {call.talkgroup}
            {call.talkgroupId ? ` (TG ${call.talkgroupId})` : ""} ·{" "}
            {relativeTime(call.receivedAt)} · {call.lat.toFixed(4)},{" "}
            {call.lng.toFixed(4)}
          </p>
        </div>
        <button
          onClick={() => {
            stop();
            onClose();
          }}
          aria-label="close"
          className="shrink-0 font-mono text-xs text-neutral-500 hover:text-black"
        >
          ✕
        </button>
      </header>

      {hasAudio ? (
        <>
          <div className="relative flex h-28 w-full items-center justify-center border-b border-neutral-200 bg-black">
            <AudioVisualizer active={playing} />
            <span className="absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-widest text-white/70">
              {playing ? "Playing" : error ? "Tap replay" : "Idle"}
            </span>
            <span className="absolute right-2 top-2 flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-white/70">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5",
                  playing ? "animate-pulse bg-white" : "bg-white/40",
                )}
              />
              SCANNER
            </span>
            <audio
              ref={audioRef}
              src={call.audioUrl}
              preload="auto"
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              className="hidden"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
            <button
              type="button"
              onClick={playing ? stop : replay}
              className="h-8 flex-1 border border-black bg-black px-3 font-mono text-xs uppercase tracking-widest text-white"
            >
              {playing ? "Stop" : "Replay"}
            </button>
            <a
              href={call.audioUrl}
              download={call.fileName}
              className="h-8 border border-neutral-300 bg-white px-3 font-mono text-xs uppercase tracking-widest text-black hover:border-black inline-flex items-center"
            >
              Download
            </a>
            <button
              type="button"
              onClick={() => {
                stop();
                onClose();
              }}
              className="h-8 border border-neutral-300 bg-white px-3 font-mono text-xs uppercase tracking-widest text-black hover:border-black"
            >
              Dismiss
            </button>
          </div>
          {error && (
            <p className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              {error.includes("interact") || error.includes("autoplay")
                ? "Autoplay blocked — press Replay"
                : `Audio error: ${error}`}
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-8 border border-neutral-300 bg-white px-3 font-mono text-xs uppercase tracking-widest text-black hover:border-black"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-y-auto">
        <section className="border-b border-neutral-200 px-3 py-3">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Call detail
          </h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-mono text-xs">
            <dt className="text-neutral-500">Call #</dt>
            <dd className="text-black">{call.callNumber}</dd>
            <dt className="text-neutral-500">Priority</dt>
            <dd className="text-black">{priorityLabel(call.priority)}</dd>
            <dt className="text-neutral-500">Type</dt>
            <dd className="text-black">
              {call.callTypeCode} · {call.callType}
            </dd>
            <dt className="text-neutral-500">Address</dt>
            <dd className="text-black">{call.address}</dd>
            <dt className="text-neutral-500">Neighborhood</dt>
            <dd className="text-black">{call.neighborhood}</dd>
            <dt className="text-neutral-500">District</dt>
            <dd className="text-black">{call.district}</dd>
            <dt className="text-neutral-500">Talkgroup</dt>
            <dd className="text-black">
              {call.talkgroup}
              {call.talkgroupId && (
                <span className="ml-1 text-neutral-500">· TG {call.talkgroupId}</span>
              )}
            </dd>
            <dt className="text-neutral-500">Source</dt>
            <dd className="text-black truncate" title={call.fileName}>
              {call.fileName}
            </dd>
          </dl>
        </section>

      </div>
    </aside>
  );
}

function PriorityChip({ priority }: { priority: string }) {
  const p = priority.toUpperCase() || "—";
  const high = isHighPriority(priority);
  return (
    <span
      className={cn(
        "border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        high ? "border-black bg-black text-white animate-pulse" : "border-black text-black",
      )}
    >
      {p}
    </span>
  );
}

function AudioVisualizer({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-1" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="block w-[3px] bg-white"
          style={{
            height: active ? `${14 + ((i * 13) % 32)}px` : "4px",
            opacity: active ? 0.9 : 0.3,
            transition: "height 180ms ease, opacity 180ms ease",
            animation: active
              ? `wd-bars 600ms ease-in-out ${(i * 60) % 600}ms infinite alternate`
              : "none",
          }}
        />
      ))}
    </div>
  );
}
