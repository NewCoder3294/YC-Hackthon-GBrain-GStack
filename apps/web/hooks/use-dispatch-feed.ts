"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DispatchCall } from "@/lib/dispatch";
import type { LiveIncident, LiveIncidentSource } from "@/lib/live-incidents";

export interface DispatchFeedConfig {
  pollMs?: number;
  maxOnScreen?: number;
  fadeAfterMs?: number;
}

interface Result {
  calls: DispatchCall[];
  paused: boolean;
  setPaused: (p: boolean) => void;
  fileCount: number;
  manifestCount: number;
  loading: boolean;
  error: string | null;
  emitNow: () => void;
}

const DEFAULT_CONFIG: Required<DispatchFeedConfig> = {
  pollMs: 30_000,
  maxOnScreen: 80,
  fadeAfterMs: 15 * 60_000,
};

// Source-specific framing for the dispatch panel header. Live incidents
// don't carry a radio talkgroup the way scanner audio does, but every
// source has a friendly label and an "agency" attribution.
const SOURCE_AGENCY: Record<LiveIncidentSource, string> = {
  sfpd_cad: "SFPD",
  sf_fire_ems: "SF Fire / EMS",
  sf_311: "SF 311",
  sfpd_reports: "SFPD Reports",
  "511_traffic": "511 Traffic",
  "511_transit": "511 Transit",
};

const SOURCE_TALKGROUP: Record<LiveIncidentSource, string> = {
  sfpd_cad: "SFPD CAD",
  sf_fire_ems: "Fire / EMS",
  sf_311: "311",
  sfpd_reports: "SFPD Reports",
  "511_traffic": "511 Traffic",
  "511_transit": "511 Transit",
};

function severityToPriority(severity: "low" | "med" | "high"): string {
  if (severity === "high") return "A";
  if (severity === "med") return "B";
  return "C";
}

function liveIncidentToDispatchCall(r: LiveIncident): DispatchCall {
  const priority =
    r.source === "sfpd_cad" && r.priority
      ? r.priority.toUpperCase()
      : severityToPriority(r.severity);
  const address =
    r.address ?? (r.neighborhood ? `Near ${r.neighborhood}` : "Unknown location");
  return {
    id: r.id,
    audioUrl: "",
    callNumber: r.sourceUid,
    receivedAt: r.occurredAt,
    recordedAt: r.occurredAt,
    callType: r.title,
    callTypeCode: r.subtitle?.split("·")[0]?.trim() ?? r.kind.toUpperCase(),
    priority,
    address,
    neighborhood: r.neighborhood ?? "",
    district: r.neighborhood ?? "",
    agency: SOURCE_AGENCY[r.source],
    talkgroup: SOURCE_TALKGROUP[r.source],
    talkgroupId: null,
    lat: r.lat,
    lng: r.lng,
    fileName: r.sourceUid,
  };
}

export function useDispatchFeed(config: DispatchFeedConfig = {}): Result {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [calls, setCalls] = useState<DispatchCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch("/api/live/incidents/recent", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `live-incidents ${res.status}`);
        setLoading(false);
        return;
      }
      const incidents: LiveIncident[] = body.incidents ?? [];
      const mapped = incidents.map(liveIncidentToDispatchCall);
      // Trim to the on-screen cap (newest first from upstream).
      setCalls(mapped.slice(0, cfg.maxOnScreen));
      setLoading(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
      setLoading(false);
    }
  }, [cfg.maxOnScreen]);

  useEffect(() => {
    void fetchOnce();
    const id = setInterval(() => {
      if (!pausedRef.current) void fetchOnce();
    }, cfg.pollMs);
    return () => clearInterval(id);
  }, [fetchOnce, cfg.pollMs]);

  // Fade older entries off-screen even between polls so the working set
  // stays current when the operator leaves the tab open.
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - cfg.fadeAfterMs;
      setCalls((prev) => {
        const next = prev.filter((c) => new Date(c.receivedAt).getTime() > cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [cfg.fadeAfterMs]);

  const emitNow = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return useMemo(
    () => ({
      calls,
      paused,
      setPaused,
      fileCount: calls.length,
      manifestCount: calls.length,
      loading,
      error,
      emitNow,
    }),
    [calls, paused, loading, error, emitNow],
  );
}
