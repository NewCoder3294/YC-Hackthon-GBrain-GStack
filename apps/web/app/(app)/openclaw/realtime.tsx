"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Realtime subscription on `incidents` + `pages`. Same pattern as
 * `components/kg/realtime-refresh.tsx`. Calls router.refresh() on each
 * relevant event so the server component re-runs and the feed updates.
 *
 * Shows a small "● live" pip that flashes on every refresh so the demo
 * audience can see the page is alive even between worker ticks.
 */
export function OpenclawRealtime() {
  const router = useRouter();
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("openclaw-live");

    for (const table of ["incidents", "pages"] as const) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        () => {
          setFlash(true);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(false), 1200);
          router.refresh();
        },
      );
    }
    channel.subscribe();

    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className="pointer-events-none absolute right-4 top-14 z-10 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full transition-opacity ${
          flash ? "bg-black opacity-100" : "bg-neutral-300 opacity-60"
        }`}
      />
      live
    </div>
  );
}
