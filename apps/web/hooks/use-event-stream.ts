"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DispatchCall } from "@/lib/dispatch";
import {
  buildDispatchEvent,
  buildPredictedEvent,
  callWarrantsEvent,
  pickOfficer,
  runPredictions,
} from "@/lib/event-engine";
import {
  AUTO_DISPATCH_MS,
  MAX_FEED_EVENTS,
  OFFICERS,
  type OperatorEvent,
} from "@/lib/events";

interface EventStream {
  events: OperatorEvent[];
  cancel: (id: string, reason?: string) => void;
  reassign: (id: string, officerName: string) => void;
  dispatchNow: (id: string) => void;
  officers: typeof OFFICERS;
}

const PREDICTION_INTERVAL_MS = 8_000;

export function useEventStream(calls: DispatchCall[]): EventStream {
  const [events, setEvents] = useState<OperatorEvent[]>([]);

  // Track which call IDs we've already emitted events for so the same
  // call doesn't get added twice when the upstream array re-renders.
  const seenCallIdsRef = useRef<Set<string>>(new Set());
  // Recent officer assignments to spread the load.
  const recentAssignmentsRef = useRef<string[]>([]);
  // Call IDs that already triggered a prediction — avoids duplicate
  // "Coordinated activity in Tenderloin" cards.
  const predictedTriggersRef = useRef<Set<string>>(new Set());

  // Helper to record an assignment in the rolling-window memory.
  const recordAssignment = (officerId: string) => {
    const arr = recentAssignmentsRef.current;
    arr.push(officerId);
    if (arr.length > 4) arr.shift();
  };

  // 1) New incoming calls → auto-events for actionable ones.
  useEffect(() => {
    if (calls.length === 0) return;
    const newEvents: OperatorEvent[] = [];
    for (const call of calls) {
      if (seenCallIdsRef.current.has(call.id)) continue;
      seenCallIdsRef.current.add(call.id);
      if (!callWarrantsEvent(call)) continue;
      const officer = pickOfficer(call, recentAssignmentsRef.current);
      recordAssignment(officer.id);
      newEvents.push(buildDispatchEvent(call, officer));
    }
    if (newEvents.length > 0) {
      setEvents((prev) => mergeEvents(prev, newEvents));
    }
  }, [calls]);

  // 2) Periodic KG-style prediction sweep over the call window.
  useEffect(() => {
    if (calls.length === 0) return;
    const tick = () => {
      const now = Date.now();
      const recent = [...calls].sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
      );
      const predictions = runPredictions({
        recentCalls: recent,
        alreadyPredicted: predictedTriggersRef.current,
        now,
      });
      if (predictions.length === 0) return;
      const newEvents: OperatorEvent[] = [];
      for (const p of predictions) {
        if (predictedTriggersRef.current.has(p.triggerCall.id)) continue;
        predictedTriggersRef.current.add(p.triggerCall.id);
        const officer = pickOfficer(p.triggerCall, recentAssignmentsRef.current);
        recordAssignment(officer.id);
        newEvents.push(buildPredictedEvent(p, officer, now));
      }
      if (newEvents.length > 0) {
        setEvents((prev) => mergeEvents(prev, newEvents));
      }
    };
    tick(); // immediate sweep on calls change
    const id = setInterval(tick, PREDICTION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [calls]);

  // 3) Countdown driver — every second, fold time forward. Any event
  // whose autoDispatchAt has passed and is still in "assigning" flips to
  // "dispatched".
  useEffect(() => {
    const id = setInterval(() => {
      setEvents((prev) => {
        const now = Date.now();
        let mutated = false;
        const next = prev.map((e) => {
          if (e.status !== "assigning") return e;
          if (!e.autoDispatchAt) return e;
          if (new Date(e.autoDispatchAt).getTime() <= now) {
            mutated = true;
            return {
              ...e,
              status: "dispatched" as const,
              dispatchedAt: new Date(now).toISOString(),
            };
          }
          return e;
        });
        return mutated ? next : prev;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  // --- Actions -----------------------------------------------------------

  const cancel = useCallback((id: string, reason: string = "Operator cancel") => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === id && (e.status === "incoming" || e.status === "assigning")
          ? {
              ...e,
              status: "cancelled",
              cancelledAt: new Date().toISOString(),
              cancelReason: reason,
            }
          : e,
      ),
    );
  }, []);

  const reassign = useCallback((id: string, officerName: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        if (e.status !== "assigning" && e.status !== "incoming") return e;
        const now = Date.now();
        // Reassigning resets the countdown — gives the operator time to
        // verify the new assignment before it auto-dispatches.
        return {
          ...e,
          status: "assigning",
          assignedOfficer: officerName,
          assignedAt: new Date(now).toISOString(),
          autoDispatchAt: new Date(now + AUTO_DISPATCH_MS).toISOString(),
        };
      }),
    );
  }, []);

  const dispatchNow = useCallback((id: string) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === id && (e.status === "assigning" || e.status === "incoming")
          ? {
              ...e,
              status: "dispatched",
              dispatchedAt: new Date().toISOString(),
              autoDispatchAt: null,
            }
          : e,
      ),
    );
  }, []);

  return useMemo(
    () => ({ events, cancel, reassign, dispatchNow, officers: OFFICERS }),
    [events, cancel, reassign, dispatchNow],
  );
}

function mergeEvents(prev: OperatorEvent[], next: OperatorEvent[]): OperatorEvent[] {
  // newest-first ordering; cap to MAX_FEED_EVENTS so the feed stays legible.
  const combined = [...next.reverse(), ...prev];
  return combined.slice(0, MAX_FEED_EVENTS);
}
