"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  audioUrl: string;
  fileName: string;
}

// Compact play/pause button for inline use in the incidents table.
// Native <audio> element is hidden; we drive it ourselves to keep the
// row visual minimal. One row playing pauses on its own when the next
// row's button is pressed because the browser allows multiple audio
// elements simultaneously — we mitigate by stopping siblings via a
// shared CustomEvent ("watchdog:dispatch-play").
const EVENT_NAME = "watchdog:dispatch-play";

export function DispatchPlayButton({ audioUrl, fileName }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const audio = ref.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    // Stop any other dispatch audio currently playing on the page.
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: audioUrl }));
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* autoplay blocked or other — UI will resync via event handlers */
    });
  };

  return (
    <div
      className={cn(
        "inline-flex h-9 w-16 items-center justify-center gap-1.5 border bg-white font-mono text-[10px] uppercase tracking-widest transition-colors",
        playing
          ? "border-black bg-black text-white"
          : "border-neutral-300 text-black hover:border-black",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${fileName}` : `Play ${fileName}`}
        title={fileName}
        className="flex h-full w-full items-center justify-center gap-1"
      >
        <span aria-hidden className="text-xs leading-none">
          {playing ? "■" : "▶"}
        </span>
        <span>{playing ? "Stop" : "Play"}</span>
      </button>
      <audio
        ref={ref}
        src={audioUrl}
        preload="none"
        className="hidden"
        onPlay={(e) => {
          setPlaying(true);
          // Listen for sibling-play events to auto-stop.
          const me = e.currentTarget;
          const handler = (ev: Event) => {
            const detail = (ev as CustomEvent<string>).detail;
            if (detail !== audioUrl) {
              me.pause();
            }
          };
          window.addEventListener(EVENT_NAME, handler);
          me.addEventListener(
            "pause",
            () => window.removeEventListener(EVENT_NAME, handler),
            { once: true },
          );
          me.addEventListener(
            "ended",
            () => window.removeEventListener(EVENT_NAME, handler),
            { once: true },
          );
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
