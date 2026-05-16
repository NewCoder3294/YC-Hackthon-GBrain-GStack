"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

interface Props {
  channelName?: string;
}

const WATCHED_TABLES = [
  "incidents",
  "predictive_alerts",
  "decisions",
  "pages",
  "gang_events",
  "live_incidents",
] as const;

const REFRESH_DEBOUNCE_MS = 2000;

/**
 * Subscribes to Postgres realtime changes on the GBrain + live_incidents
 * tables and calls router.refresh() so server components re-run and the
 * UI redraws with the new data.
 *
 * Refreshes are debounced (2s window) so a burst of inserts — e.g.,
 * SFPD CAD sync writing dozens of rows — collapses to one re-render.
 *
 * A small "● live" status pip flashes whenever a refresh has just fired.
 */
export function RealtimeRefresh({ channelName = "kg-live" }: Props) {
  const router = useRouter();
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventRef = useRef<string>("");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(channelName);
    for (const table of WATCHED_TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table },
        (payload: { table: string; eventType: string }) => {
          lastEventRef.current = `${payload.table}:${payload.eventType}`;
          setFlash(true);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(false), 1200);
          // Debounce refresh: collapse burst inserts into one re-render.
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => {
            refreshTimer.current = null;
            router.refresh();
          }, REFRESH_DEBOUNCE_MS);
        },
      );
    }
    channel.subscribe();
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [router, channelName]);

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 border border-neutral-200 bg-white px-2 py-1">
      <span
        className={`h-1.5 w-1.5 rounded-full transition-colors ${
          flash ? "bg-black" : "animate-pulse bg-neutral-400"
        }`}
      />
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {flash ? "Updated" : "Realtime"}
      </span>
    </div>
  );
}
