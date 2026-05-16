"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioFile, DispatchCall } from "@/lib/dispatch";
import {
  createFeedCursor,
  jitterInterval,
  nextDispatch,
  type FeedCursor,
} from "@/lib/dispatch-feed";

export interface DispatchFeedConfig {
  meanIntervalMs?: number;
  maxOnScreen?: number;
  fadeAfterMs?: number;
  initialBurst?: number;
}

interface CatalogState {
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

const DEFAULT_CONFIG: Required<DispatchFeedConfig> = {
  meanIntervalMs: 14_000,
  maxOnScreen: 50,
  fadeAfterMs: 5 * 60_000,
  initialBurst: 6,
};

export function useDispatchFeed(config: DispatchFeedConfig = {}): Result {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [catalog, setCatalog] = useState<CatalogState>({
    files: [],
    loading: true,
    error: null,
    manifestCount: 0,
  });
  const [calls, setCalls] = useState<DispatchCall[]>([]);
  const [paused, setPaused] = useState(false);

  const cursorRef = useRef<FeedCursor | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Load the dispatch catalog once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dispatch/manifest", { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) {
          setCatalog({
            files: [],
            loading: false,
            error: `catalog ${res.status}`,
            manifestCount: 0,
          });
          return;
        }
        const body = await res.json();
        const files: AudioFile[] = body.files ?? [];
        setCatalog({
          files,
          loading: false,
          error: files.length === 0 ? "catalog empty" : null,
          manifestCount: body.withManifest ?? 0,
        });
      } catch (err) {
        if (!alive) return;
        setCatalog({
          files: [],
          loading: false,
          error: err instanceof Error ? err.message : "catalog fetch failed",
          manifestCount: 0,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Prime the cursor when the catalog arrives.
  useEffect(() => {
    if (catalog.files.length === 0) {
      cursorRef.current = null;
      return;
    }
    cursorRef.current = createFeedCursor(catalog.files);

    // Seed the map with a short initial burst so the operator isn't
    // staring at an empty canvas on first paint.
    setCalls((prev) => {
      if (prev.length > 0) return prev;
      if (!cursorRef.current) return prev;
      const burst: DispatchCall[] = [];
      const now = Date.now();
      for (let i = 0; i < cfg.initialBurst; i++) {
        const c = nextDispatch(cursorRef.current);
        const ageSec = (cfg.initialBurst - i) * 28;
        burst.push({ ...c, receivedAt: new Date(now - ageSec * 1000).toISOString() });
      }
      return burst;
    });
  }, [catalog.files, cfg.initialBurst]);

  // Release loop — poisson-ish timer, self-rescheduling.
  const schedule = useCallback(() => {
    const tick = () => {
      const cursor = cursorRef.current;
      if (cursor && !pausedRef.current) {
        try {
          const call = nextDispatch(cursor);
          setCalls((prev) => {
            const next = [...prev, call];
            return next.length > cfg.maxOnScreen
              ? next.slice(next.length - cfg.maxOnScreen)
              : next;
          });
        } catch {
          // Catalog drained — next refresh will rebuild.
        }
      }
      const delay = jitterInterval(cfg.meanIntervalMs, Math.random);
      timerRef.current = setTimeout(tick, delay);
    };
    timerRef.current = setTimeout(tick, jitterInterval(cfg.meanIntervalMs, Math.random));
  }, [cfg.maxOnScreen, cfg.meanIntervalMs]);

  useEffect(() => {
    if (catalog.files.length === 0) return;
    schedule();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [catalog.files, schedule]);

  // Fade older calls so the on-screen set stays current.
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
    const cursor = cursorRef.current;
    if (!cursor) return;
    try {
      const call = nextDispatch(cursor);
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
      fileCount: catalog.files.length,
      manifestCount: catalog.manifestCount,
      loading: catalog.loading,
      error: catalog.error,
      emitNow,
    }),
    [calls, paused, catalog.files.length, catalog.manifestCount, catalog.loading, catalog.error, emitNow],
  );
}
