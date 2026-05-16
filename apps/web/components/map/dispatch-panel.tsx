"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isHighPriority, priorityLabel, type DispatchCall } from "@/lib/dispatch";

interface Props {
  call: DispatchCall;
  onClose: () => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.round(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function buildReadout(call: DispatchCall): string {
  const timeStr = formatTime(call.receivedAt);
  const prio = priorityLabel(call.priority);
  const districtPart = call.district ? ` In ${call.district.toLowerCase()} district.` : "";
  return `Dispatch call. ${prio}. ${call.callType} reported at ${call.address}.${districtPart} Received at ${timeStr}. Call number ${call.callNumber}.`;
}

export function DispatchPanel({ call, onClose }: Props) {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const readout = buildReadout(call);

  const speak = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setUnsupported(true);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(readout);
    u.rate = 1.05;
    u.pitch = 0.95;
    u.volume = 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  }, [readout]);

  const stop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  // Auto-play once when the panel opens for a given call; stop on unmount/swap.
  useEffect(() => {
    speak();
    return () => {
      stop();
    };
  }, [speak, stop]);

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
            {call.agency} · {relativeTime(call.receivedAt)} · {call.lat.toFixed(4)},{" "}
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

      <div className="relative flex h-28 w-full items-center justify-center border-b border-neutral-200 bg-black">
        <AudioVisualizer active={speaking} />
        <span className="absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-widest text-white/70">
          {speaking ? "Reading" : "Idle"}
        </span>
        <span className="absolute right-2 top-2 flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-white/70">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5",
              speaking ? "animate-pulse bg-white" : "bg-white/40",
            )}
          />
          TTS
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <button
          type="button"
          onClick={speaking ? stop : speak}
          disabled={unsupported}
          className="h-8 flex-1 border border-black bg-black px-3 font-mono text-xs uppercase tracking-widest text-white disabled:opacity-30"
        >
          {speaking ? "Stop" : "Replay readout"}
        </button>
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
            <dt className="text-neutral-500">Address</dt>
            <dd className="text-black">{call.address}</dd>
            {call.neighborhood && (
              <>
                <dt className="text-neutral-500">Neighborhood</dt>
                <dd className="text-black">{call.neighborhood}</dd>
              </>
            )}
            {call.district && (
              <>
                <dt className="text-neutral-500">District</dt>
                <dd className="text-black">{call.district}</dd>
              </>
            )}
            <dt className="text-neutral-500">Received</dt>
            <dd className="text-black">{formatTime(call.receivedAt)}</dd>
            {call.disposition && (
              <>
                <dt className="text-neutral-500">Disposition</dt>
                <dd className="text-black">{call.disposition}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="px-3 py-3">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Readout (TTS)
          </h3>
          <p className="mt-2 border-l border-neutral-200 pl-3 font-mono text-xs leading-snug text-black">
            {readout}
          </p>
          {unsupported && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Web Speech API unavailable in this browser
            </p>
          )}
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
