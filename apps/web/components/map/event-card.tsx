"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { priorityLabel } from "@/lib/dispatch";
import { AUTO_DISPATCH_MS, type Officer, type OperatorEvent } from "@/lib/events";

interface Props {
  event: OperatorEvent;
  officers: Officer[];
  onCancel: (id: string) => void;
  onReassign: (id: string, officerName: string) => void;
  onDispatchNow: (id: string) => void;
  onLocate?: ((lat: number, lng: number) => void) | undefined;
}

function formatAge(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 1000) return "now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

export function EventCard({
  event,
  officers,
  onCancel,
  onReassign,
  onDispatchNow,
  onLocate,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [reassignOpen, setReassignOpen] = useState(false);

  // Tick once per second so the countdown / age update without keeping
  // the parent feed in a 1s render loop.
  useEffect(() => {
    if (event.status !== "assigning" && event.status !== "incoming") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [event.status]);

  const isPredicted = event.kind === "predicted";
  const isDone =
    event.status === "dispatched" || event.status === "cancelled";

  const msUntilAutoDispatch = event.autoDispatchAt
    ? new Date(event.autoDispatchAt).getTime() - now
    : null;
  const countdownSec =
    msUntilAutoDispatch != null && msUntilAutoDispatch > 0
      ? Math.ceil(msUntilAutoDispatch / 1000)
      : 0;
  const countdownPct =
    msUntilAutoDispatch != null
      ? Math.max(0, Math.min(1, msUntilAutoDispatch / AUTO_DISPATCH_MS))
      : 0;

  return (
    <article
      className={cn(
        "border bg-white transition-opacity",
        isPredicted ? "border-l-[3px] border-l-black border-y-neutral-200 border-r-neutral-200" : "border-neutral-200",
        event.status === "cancelled" && "opacity-50",
        event.status === "dispatched" && "bg-neutral-50",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <KindChip kind={event.kind} />
          <PriorityChip priority={event.call.priority} />
          <span className="truncate font-mono text-[10px] uppercase tracking-widest text-neutral-700">
            {event.call.callTypeCode}
            {event.call.callTypeCode ? " · " : ""}
            {event.call.callType}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          {formatAge(event.createdAt, now)}
        </span>
      </header>

      <div className="px-3 py-2 space-y-1">
        <button
          type="button"
          onClick={() => onLocate?.(event.call.lat, event.call.lng)}
          className="block w-full text-left font-mono text-xs text-black hover:text-neutral-500"
          title="Center map on this call"
        >
          {event.call.address}
        </button>
        <p className="font-mono text-[10px] text-neutral-500">
          {event.call.neighborhood} · {event.call.talkgroup}
        </p>

        {isPredicted && event.reason && (
          <div className="mt-1.5 border border-dashed border-neutral-300 bg-neutral-50 px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
              GBrain prediction
              {event.confidence != null && (
                <span className="ml-1 text-neutral-700">
                  · conf {event.confidence.toFixed(2)}
                </span>
              )}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-black">{event.reason}</p>
            {event.signals.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {event.signals.slice(0, 3).map((s, i) => (
                  <li key={i} className="font-mono text-[9px] text-neutral-500 truncate">
                    · {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-neutral-100 px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-black truncate">
            {event.status === "cancelled"
              ? "Cancelled"
              : event.status === "dispatched"
                ? `Dispatched · ${event.assignedOfficer}`
                : event.assignedOfficer ?? "Unassigned"}
          </span>
          {event.status === "assigning" && (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
              Auto in {countdownSec}s
            </span>
          )}
        </div>
        {event.status === "assigning" && (
          <div className="mt-1.5 h-[2px] w-full bg-neutral-100">
            <div
              className="h-full bg-black transition-[width] duration-1000 ease-linear"
              style={{ width: `${countdownPct * 100}%` }}
            />
          </div>
        )}
      </div>

      {!isDone && (
        <div className="flex items-center border-t border-neutral-100">
          <button
            type="button"
            onClick={() => onCancel(event.id)}
            className="flex-1 border-r border-neutral-100 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 hover:text-black"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setReassignOpen((v) => !v)}
            aria-expanded={reassignOpen}
            className={cn(
              "flex-1 border-r border-neutral-100 py-1.5 font-mono text-[10px] uppercase tracking-widest hover:bg-neutral-50",
              reassignOpen ? "bg-neutral-50 text-black" : "text-neutral-500 hover:text-black",
            )}
          >
            Reassign
          </button>
          <button
            type="button"
            onClick={() => onDispatchNow(event.id)}
            className="flex-1 py-1.5 font-mono text-[10px] uppercase tracking-widest bg-black text-white hover:bg-neutral-800"
          >
            Dispatch
          </button>
        </div>
      )}

      {reassignOpen && !isDone && (
        <div className="max-h-32 overflow-y-auto border-t border-neutral-100 bg-neutral-50">
          {officers
            .filter((o) => o.name !== event.assignedOfficer)
            .map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onReassign(event.id, o.name);
                  setReassignOpen(false);
                }}
                className="block w-full px-3 py-1 text-left font-mono text-[10px] text-black hover:bg-white"
              >
                {o.name} <span className="text-neutral-500">· {o.company}</span>
              </button>
            ))}
        </div>
      )}
    </article>
  );
}

function KindChip({ kind }: { kind: OperatorEvent["kind"] }) {
  return (
    <span
      className={cn(
        "shrink-0 border px-1 py-px font-mono text-[8px] uppercase tracking-widest",
        kind === "predicted"
          ? "border-black bg-black text-white"
          : "border-neutral-400 bg-white text-neutral-600",
      )}
    >
      {kind === "predicted" ? "PRED" : "LIVE"}
    </span>
  );
}

function PriorityChip({ priority }: { priority: string }) {
  const p = priority.toUpperCase() || "—";
  const high = p === "A" || p === "B";
  return (
    <span
      title={priorityLabel(priority)}
      className={cn(
        "shrink-0 border px-1 py-px font-mono text-[8px] font-bold uppercase tracking-widest",
        high ? "border-black bg-white text-black" : "border-neutral-300 bg-neutral-50 text-neutral-500",
      )}
    >
      {p}
    </span>
  );
}
