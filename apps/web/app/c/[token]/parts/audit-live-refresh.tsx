"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Visibility-aware polling for the citizen audit table. The admin-client
 * server query re-runs every POLL_MS while the tab is visible, and
 * immediately on tab focus or wake. We don't subscribe via supabase
 * realtime here because that would require an RLS policy permitting
 * anon SELECT on camera_access_events — and rows are sensitive across
 * contributors. Polling routes through the server-rendered page where
 * the admin client already enforces "rows for this contributor's
 * cameras only", so no surface is widened.
 */
const POLL_MS = 5_000;

export function AuditLiveRefresh() {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let alive = true;

    const flash = () => {
      if (!alive) return;
      setPulse(true);
      setTimeout(() => alive && setPulse(false), 800);
    };

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      flash();
      router.refresh();
    };

    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(tick, POLL_MS);
    };

    const stop = () => {
      if (!intervalRef.current) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        flash();
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);

    return () => {
      alive = false;
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [router]);

  return (
    <span
      aria-label={pulse ? "refreshing audit log" : "live"}
      className="ml-2 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-neutral-500"
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          pulse ? "bg-black" : "bg-neutral-400"
        } transition-colors`}
      />
      live
    </span>
  );
}
