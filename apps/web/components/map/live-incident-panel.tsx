"use client";

import { useEffect, useState } from "react";
import {
  KIND_GLYPH,
  KIND_LABEL,
  SOURCE_LABEL,
  relativeTime,
  type LiveIncident,
} from "@/lib/live-incidents";
import { cn } from "@/lib/utils";

// Optional demo-time field — when present, the panel renders relative
// time against displayedAt instead of the raw occurred_at so the panel's
// "X ago" matches the marker's "X ago" on the table/map.
interface Props {
  incident: LiveIncident & { displayedAt?: string };
  onClose: () => void;
}

const TICK_MS = 1_000;

function SeverityChip({ severity }: { severity: LiveIncident["severity"] }) {
  // No hue — distinction comes from fill and motion only (per design spec).
  const style: Record<LiveIncident["severity"], string> = {
    low: "border-neutral-300 text-neutral-500",
    med: "border-black text-black",
    high: "border-black bg-black text-white animate-pulse",
  };
  return (
    <span
      className={cn(
        "border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        style[severity],
      )}
    >
      {severity}
    </span>
  );
}

function GeoBadge({ precision }: { precision: LiveIncident["geoPrecision"] }) {
  if (precision === "exact" || precision === "intersection") return null;
  return (
    <span className="border border-dashed border-neutral-400 px-1 py-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
      {precision === "neighborhood" ? "approx · neighborhood" : "location unknown"}
    </span>
  );
}

export function LiveIncidentPanel({ incident, onClose }: Props) {
  const kindGlyph = KIND_GLYPH[incident.kind];
  // Tick once a second so the relative-time labels stay current while the
  // panel is open. Keeps the "30s ago → 31s ago → …" feel alive.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const stampForRelative = incident.displayedAt ?? incident.occurredAt;

  return (
    <aside className="absolute right-4 top-4 z-10 flex max-h-[calc(100vh-7rem)] w-[420px] flex-col overflow-hidden border border-neutral-200 bg-white">
      <header className="flex items-start justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SeverityChip severity={incident.severity} />
            <span
              aria-hidden
              className="flex h-4 w-4 items-center justify-center font-mono text-[12px] leading-none"
            >
              {kindGlyph}
            </span>
            <p className="truncate font-mono text-xs uppercase tracking-widest">
              {incident.title}
            </p>
          </div>
          <p className="mt-1 font-mono text-[10px] text-neutral-500">
            {SOURCE_LABEL[incident.source]} · {KIND_LABEL[incident.kind]} ·{" "}
            {relativeTime(stampForRelative, now)}
            {incident.priority ? ` · P${incident.priority}` : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="close"
          className="shrink-0 font-mono text-xs text-neutral-500 hover:text-black"
        >
          ✕
        </button>
      </header>

      <div className="overflow-y-auto">
        {incident.subtitle && (
          <section className="border-b border-neutral-200 px-3 py-3">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Detail
            </h3>
            <p className="mt-1 font-mono text-xs leading-relaxed">{incident.subtitle}</p>
          </section>
        )}

        <section className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-neutral-200 px-3 py-3">
          {incident.neighborhood && (
            <Field label="Neighborhood" value={incident.neighborhood} />
          )}
          {incident.address && <Field label="Address" value={incident.address} />}
          {incident.status && <Field label="Status" value={incident.status} />}
          {incident.priority && <Field label="Priority" value={incident.priority} />}
          <Field label="Source id" value={incident.sourceUid} mono />
          <Field
            label="Occurred"
            value={new Date(incident.occurredAt).toISOString().slice(0, 16).replace("T", " ")}
            mono
          />
        </section>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-neutral-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
          </span>
          <GeoBadge precision={incident.geoPrecision} />
        </div>
        {incident.acknowledgedAt ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            ack {relativeTime(incident.acknowledgedAt, now)}
          </span>
        ) : null}
      </footer>
    </aside>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className={cn("text-xs leading-tight", mono ? "font-mono" : "")}>{value}</div>
    </div>
  );
}
