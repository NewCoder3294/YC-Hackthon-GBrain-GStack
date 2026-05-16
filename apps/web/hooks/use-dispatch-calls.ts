"use client";

import { useEffect, useState } from "react";
import type { DispatchCall } from "@/lib/dispatch";

interface State {
  calls: DispatchCall[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
}

const POLL_MS = 60_000;

export function useDispatchCalls(): State {
  const [state, setState] = useState<State>({
    calls: [],
    loading: true,
    error: null,
    lastFetchedAt: null,
  });

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/dispatch/recent", { cache: "no-store" });
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setState((s) => ({ ...s, loading: false, error: body.error ?? "fetch failed" }));
          return;
        }
        setState({
          calls: body.calls ?? [],
          loading: false,
          error: null,
          lastFetchedAt: new Date(),
        });
      } catch (err) {
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "fetch failed",
        }));
      }
    }

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return state;
}
