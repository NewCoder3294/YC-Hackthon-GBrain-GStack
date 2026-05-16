"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { OperatorEvent, Officer } from "@/lib/events";
import { EventCard } from "./event-card";

interface Props {
  events: OperatorEvent[];
  officers: Officer[];
  onCancel: (id: string) => void;
  onReassign: (id: string, officerName: string) => void;
  onDispatchNow: (id: string) => void;
  onLocate?: ((lat: number, lng: number) => void) | undefined;
}

type FilterMode = "all" | "live" | "predicted";

export function EventFeed({
  events,
  officers,
  onCancel,
  onReassign,
  onDispatchNow,
  onLocate,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");

  const visible = useMemo(() => {
    if (filter === "live") return events.filter((e) => e.kind === "dispatch");
    if (filter === "predicted") return events.filter((e) => e.kind === "predicted");
    return events;
  }, [events, filter]);

  const assigningCount = events.filter((e) => e.status === "assigning").length;
  const predictedCount = events.filter((e) => e.kind === "predicted").length;

  return (
    <aside
      className={cn(
        "pointer-events-auto absolute bottom-4 right-4 z-20 flex w-[340px] flex-col border border-neutral-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        collapsed ? "max-h-[40px]" : "max-h-[60vh]",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-black">
            Live events
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
            {assigningCount} assigning · {predictedCount} predicted
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand event feed" : "Collapse event feed"}
          className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
        >
          {collapsed ? "▲" : "▼"}
        </button>
      </header>

      {!collapsed && (
        <>
          <div className="flex border-b border-neutral-200">
            {(["all", "live", "predicted"] as FilterMode[]).map((f, i) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "flex-1 border-neutral-200 py-1.5 font-mono text-[9px] uppercase tracking-widest",
                  filter === f
                    ? "bg-black text-white"
                    : "bg-white text-neutral-500 hover:text-black",
                  i > 0 && "border-l",
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {visible.length === 0 ? (
              <p className="py-8 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                {events.length === 0
                  ? "Waiting for first event…"
                  : "No events match filter"}
              </p>
            ) : (
              visible.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  officers={officers}
                  onCancel={onCancel}
                  onReassign={onReassign}
                  onDispatchNow={onDispatchNow}
                  onLocate={onLocate}
                />
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
}
