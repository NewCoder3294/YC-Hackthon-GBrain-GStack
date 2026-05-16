"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioFile, DispatchCall } from "@/lib/dispatch";
import {
  createSimulatorState,
  jitterInterval,
  nextDispatchCall,
  type SimulatorState,
} from "@/lib/dispatch-simulator";

export interface SimulationConfig {
  meanIntervalMs?: number;
  maxOnScreen?: number;
  fadeAfterMs?: number;
  initialBurst?: number;
  seedFromManifest?: boolean;
}

interface State {
  files: AudioFile[];
  loading: boolean;
  error: string | null;
  manifestCount: number;
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

const DEFAULT_CONFIG: Required<Omit<SimulationConfig, "seedFromManifest">> & {
  seedFromManifest: boolean;
} = {
  meanIntervalMs: 14_000,
  maxOnScreen: 50,
  fadeAfterMs: 5 * 60_000,
  initialBurst: 6,
  seedFromManifest: false,
};

export function useDispatchSimulation(config: SimulationConfig = {}): Result {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [meta, setMeta] = useState<State>({
    files: [],
    loading: true,
    error: null,
    manifestCount: 0,
  });
  const [calls, setCalls] = useState<DispatchCall[]>([]);
  const [paused, setPaused] = useState(false);

  const stateRef = useRef<SimulatorState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Load manifest once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dispatch/manifest", { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) {
          setMeta({ files: [], loading: false, error: `manifest ${res.status}`, manifestCount: 0 });
          return;
        }
        const body = await res.json();
        const files: AudioFile[] = body.files ?? [];
        setMeta({
          files,
          loading: false,
          error: files.length === 0 ? "no audio files in /public/dispatch-audio" : null,
          manifestCount: body.withManifest ?? 0,
        });
      } catch (err) {
        if (!alive) return;
        setMeta({
          files: [],
          loading: false,
          error: err instanceof Error ? err.message : "manifest fetch failed",
          manifestCount: 0,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Spin up the simulator state once we have files.
  useEffect(() => {
    if (meta.files.length === 0) {
      stateRef.current = null;
      return;
    }
    stateRef.current = createSimulatorState(meta.files);

    // Seed the map with an initial small burst so the first user doesn't
    // stare at an empty canvas waiting for the first poisson tick.
    setCalls((prev) => {
      if (prev.length > 0) return prev;
      if (!stateRef.current) return prev;
      const burst: DispatchCall[] = [];
      const now = Date.now();
      for (let i = 0; i < cfg.initialBurst; i++) {
        const c = nextDispatchCall(stateRef.current);
        // Backdate so the burst feels recent-but-staggered.
        const ageSec = (cfg.initialBurst - i) * 28;
        burst.push({ ...c, receivedAt: new Date(now - ageSec * 1000).toISOString() });
      }
      return burst;
    });
  }, [meta.files, cfg.initialBurst]);

  // Release loop — poisson-ish timer, self-rescheduling.
  const schedule = useCallback(() => {
    const tick = () => {
      const sim = stateRef.current;
      if (sim && !pausedRef.current) {
        try {
          const call = nextDispatchCall(sim);
          setCalls((prev) => {
            const next = [...prev, call];
            return next.length > cfg.maxOnScreen
              ? next.slice(next.length - cfg.maxOnScreen)
              : next;
          });
        } catch {
          // empty deck — ignore, the next manifest load will rebuild.
        }
      }
      const delay = jitterInterval(cfg.meanIntervalMs, Math.random);
      timerRef.current = setTimeout(tick, delay);
    };
    timerRef.current = setTimeout(tick, jitterInterval(cfg.meanIntervalMs, Math.random));
  }, [cfg.maxOnScreen, cfg.meanIntervalMs]);

  useEffect(() => {
    if (meta.files.length === 0) return;
    schedule();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [meta.files, schedule]);

  // Fade old calls.
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - cfg.fadeAfterMs;
      setCalls((prev) => {
        const filtered = prev.filter((c) => new Date(c.receivedAt).getTime() > cutoff);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 10_000);
    return () => clearInterval(id);
  }, [cfg.fadeAfterMs]);

  const emitNow = useCallback(() => {
    const sim = stateRef.current;
    if (!sim) return;
    try {
      const call = nextDispatchCall(sim);
      setCalls((prev) => {
        const next = [...prev, call];
        return next.length > cfg.maxOnScreen
          ? next.slice(next.length - cfg.maxOnScreen)
          : next;
      });
    } catch {
      // ignore
    }
  }, [cfg.maxOnScreen]);

  return useMemo(
    () => ({
      calls,
      paused,
      setPaused,
      fileCount: meta.files.length,
      manifestCount: meta.manifestCount,
      loading: meta.loading,
      error: meta.error,
      emitNow,
    }),
    [calls, paused, meta.files.length, meta.manifestCount, meta.loading, meta.error, emitNow],
  );
}
