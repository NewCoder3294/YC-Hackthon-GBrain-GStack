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
  // from origin/main: keep /live in sync on SFPD CAD sync bursts
  "live_incidents",
] as const;

const FLASH_DURATION_MS = 1200;
const ROUTER_REFRESH_DEBOUNCE_MS = 800;

/**
 * Subscribes to Postgres realtime changes on the GBrain-shaped tables.
 * The "Updated" pip flashes immediately on every event (leading edge) so
 * the dispatcher sees liveness, but router.refresh() is debounced
 * (trailing edge, ROUTER_REFRESH_DEBOUNCE_MS) to coalesce event bursts
 * into a single server re-render. This pip/refresh decoupling is
 * intentional — do not "sync" the pip to the refresh timing.
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
          flashTimer.current = setTimeout(() => setFlash(false), FLASH_DURATION_MS);
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), ROUTER_REFRESH_DEBOUNCE_MS);
        },
      );
    }
    channel.subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
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
