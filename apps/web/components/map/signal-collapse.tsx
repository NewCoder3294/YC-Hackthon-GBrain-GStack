"use client";

/**
 * Signal-collapse animation — PRD §2 thesis as motion.
 *
 * Separate signals appear at their real lat/lng+timestamps, then converge
 * into one pulsing ranked incident pin, with a timeline strip collapsing
 * each signal row into a single incident row.
 *
 * OPTION B — REAL DATA ONLY. This component is built in isolation against
 * the real correlator→signal_events shape so it is drop-in once that data
 * exists. It does NOT import watchdog-fixtures. `incident == null` renders
 * nothing — that is the deliberate gate: until the correlator produces a
 * TRD §3.2 incident with resolved signal_ids, the live demo shows nothing
 * rather than fake motion.
 *
 * BLOCKER + wiring checklist:
 *   docs/superpowers/specs/2026-05-16-signal-collapse-animation.md
 *
 * No new deps: CSS/Tailwind transitions + requestAnimationFrame only.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type CollapseSignalKind =
  | "camera_public"
  | "camera_private"
  | "call_911"
  | "citizen_report";

/** Resolved from `signal_events` via `incidents.signal_ids[]`. */
export interface CollapseSignal {
  id: string;
  kind: CollapseSignalKind;
  /** signal_events.payload.feed, e.g. "datasf_sfpd_incidents". */
  feed?: string;
  /** ISO — signal_events.occurred_at. */
  occurredAt: string;
  lat: number;
  lng: number;
  label: string;
}

/** TRD §3.2 incident with its contributing signals resolved. */
export interface CollapseIncident {
  id: string;
  type: string | null;
  /** 0..1 computed severity. */
  severity: number;
  centroid: { lat: number; lng: number };
  earliestSignalAt: string;
  signals: CollapseSignal[];
}

export interface SignalCollapseProps {
  /** Real correlator output. `null` → render nothing (the gate). */
  incident: CollapseIncident | null;
  /** Injected projector: maplibre `map.project` over sf-map; linear bbox in isolation. */
  project: (lngLat: [number, number]) => { x: number; y: number };
  /** ms before the animation auto-replays for a continuous demo. 0 = no loop. */
  loopDelayMs?: number;
}

type Phase = "scatter" | "converge" | "collapsed";

const SCATTER_MS = 1200;
const CONVERGE_MS = 1500;

const GLYPH: Record<CollapseSignalKind, string> = {
  camera_public: "■",
  camera_private: "◆",
  call_911: "▲",
  citizen_report: "●",
};

const KIND_LABEL: Record<CollapseSignalKind, string> = {
  camera_public: "Camera",
  camera_private: "Camera (private)",
  call_911: "911 / report",
  citizen_report: "Citizen",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SignalCollapse({
  incident,
  project,
  loopDelayMs = 0,
}: SignalCollapseProps) {
  const [phase, setPhase] = useState<Phase>("scatter");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Stable list of signals ordered by occurrence (earliest first).
  const signals = useMemo(() => {
    if (incident === null) return [];
    return [...incident.signals].sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
  }, [incident]);

  const incidentId = incident?.id ?? null;

  useEffect(() => {
    if (incidentId === null) return;
    const clearAll = () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
    const cycle = () => {
      setPhase("scatter");
      timers.current.push(setTimeout(() => setPhase("converge"), SCATTER_MS));
      timers.current.push(
        setTimeout(() => setPhase("collapsed"), SCATTER_MS + CONVERGE_MS),
      );
      if (loopDelayMs > 0) {
        timers.current.push(
          setTimeout(cycle, SCATTER_MS + CONVERGE_MS + loopDelayMs),
        );
      }
    };
    clearAll();
    cycle();
    return clearAll;
  }, [incidentId, loopDelayMs]);

  if (incident === null) return null;

  const c = project([incident.centroid.lng, incident.centroid.lat]);
  const severityPct = Math.round(
    Math.min(1, Math.max(0, incident.severity)) * 100,
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* Signal pins: scatter at own position, then transform to centroid */}
      {signals.map((s, i) => {
        const p = project([s.lng, s.lat]);
        const collapsed = phase !== "scatter";
        const dx = collapsed ? c.x - p.x : 0;
        const dy = collapsed ? c.y - p.y : 0;
        const revealDelay = (i / Math.max(1, signals.length)) * SCATTER_MS;
        return (
          <div
            key={s.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[11px]"
            style={{
              left: p.x,
              top: p.y,
              transform: `translate(${dx}px, ${dy}px)`,
              opacity: phase === "collapsed" ? 0 : 1,
              transition: `transform ${CONVERGE_MS}ms cubic-bezier(.5,0,.2,1) ${
                phase === "converge" ? "0ms" : "0ms"
              }, opacity 350ms ease ${
                phase === "collapsed" ? "0ms" : `${revealDelay}ms`
              }`,
            }}
          >
            <span className="rounded-sm bg-black/80 px-1 py-0.5 text-white">
              {GLYPH[s.kind]}
            </span>
          </div>
        );
      })}

      {/* Collapsed incident pin */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          left: c.x,
          top: c.y,
          opacity: phase === "collapsed" ? 1 : 0,
          transition: "opacity 400ms ease",
        }}
      >
        <span className="relative flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/60" />
          <span className="relative inline-flex h-4 w-4 rounded-full bg-red-600" />
        </span>
      </div>

      {/* Timeline strip — rows collapse into one incident row */}
      <div className="absolute bottom-3 left-3 w-72 rounded-md border border-neutral-200 bg-white/95 p-2 font-mono text-[10px] shadow-sm">
        <div className="mb-1 flex items-center justify-between uppercase tracking-widest text-neutral-500">
          <span>{incident.type ?? "incident"}</span>
          <span>sev {severityPct}%</span>
        </div>
        <div className="relative">
          {signals.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 overflow-hidden border-l-2 border-neutral-300 pl-2"
              style={{
                maxHeight: phase === "collapsed" ? 0 : 22,
                opacity: phase === "collapsed" ? 0 : 1,
                marginBottom: phase === "collapsed" ? 0 : 2,
                transition: "max-height 500ms ease, opacity 350ms ease",
              }}
            >
              <span className="text-neutral-400">{fmtTime(s.occurredAt)}</span>
              <span>{GLYPH[s.kind]}</span>
              <span className="truncate text-neutral-600">
                {KIND_LABEL[s.kind]}
                {s.feed ? ` · ${s.feed}` : ""}
              </span>
            </div>
          ))}
          <div
            className="flex items-center gap-2 border-l-2 border-red-500 pl-2"
            style={{
              maxHeight: phase === "collapsed" ? 24 : 0,
              opacity: phase === "collapsed" ? 1 : 0,
              transition: "max-height 500ms ease 150ms, opacity 350ms ease 200ms",
            }}
          >
            <span className="text-neutral-400">
              {fmtTime(incident.earliestSignalAt)}
            </span>
            <span className="text-red-600">◉</span>
            <span className="truncate text-neutral-800">
              1 incident · {signals.length} signals fused
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
