"use client";

import { useState } from "react";
import type { WdIncident, WdSignal } from "@/lib/watchdog-fixtures";
import { cn } from "@/lib/utils";

interface Props {
  incident: WdIncident;
  onClose: () => void;
}

const KIND_GLYPH: Record<WdSignal["kind"], string> = {
  camera: "■",
  call_911: "▲",
  citizen_report: "●",
  shotspotter: "✦",
};

const KIND_LABEL: Record<WdSignal["kind"], string> = {
  camera: "Camera",
  call_911: "911",
  citizen_report: "Citizen",
  shotspotter: "ShotSpotter",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.round(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function IncidentPanel({ incident, onClose }: Props) {
  const [decided, setDecided] = useState<"act" | "hold" | "dismiss" | null>(
    incident.status === "acted"
      ? "act"
      : incident.status === "held"
        ? "hold"
        : incident.status === "dismissed"
          ? "dismiss"
          : null,
  );
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    if (!decided || !reason.trim()) return;
    setSubmitted(true);
    // Write-back to GBrain would happen here.
  }

  const sortedSignals = [...incident.signals].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  return (
    <aside className="absolute right-4 top-4 z-10 flex max-h-[calc(100vh-7rem)] w-[420px] flex-col overflow-hidden border border-neutral-200 bg-white">
      <header className="flex items-start justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SeverityChip severity={incident.severity} />
            <p className="truncate font-mono text-xs uppercase tracking-widest">
              {incident.title}
            </p>
          </div>
          <p className="mt-1 font-mono text-[10px] text-neutral-500">
            {incident.type} · {relativeTime(incident.earliestSignalAt)} ·{" "}
            {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
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
        <section className="border-b border-neutral-200 px-3 py-3">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Contributing Signals · {incident.signals.length}
          </h3>
          <ol className="mt-2 space-y-2">
            {sortedSignals.map((s) => (
              <li key={s.id} className="flex items-baseline gap-2">
                <span className="w-3 shrink-0 font-mono text-xs leading-none">
                  {KIND_GLYPH[s.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs">{s.label}</p>
                  <p className="font-mono text-[10px] text-neutral-500">
                    {KIND_LABEL[s.kind]} · {relativeTime(s.occurredAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-b border-neutral-200 px-3 py-3">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Prior Context · GBrain
          </h3>
          {incident.priorContext.length === 0 ? (
            <p className="mt-2 font-mono text-xs text-neutral-500">
              No related records found.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 border-l border-neutral-200 pl-3">
              {incident.priorContext.map((line, i) => (
                <li key={i} className="font-mono text-xs leading-snug">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="px-3 py-3">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Decision
          </h3>

          {submitted ? (
            <p className="mt-2 border border-black px-3 py-2 font-mono text-xs">
              Recorded: {decided?.toUpperCase()} — {reason}
            </p>
          ) : (
            <>
              <div className="mt-2 flex">
                {(["act", "hold", "dismiss"] as const).map((opt, i) => (
                  <button
                    key={opt}
                    onClick={() => setDecided(opt)}
                    className={cn(
                      "h-8 flex-1 border border-neutral-200 px-2 font-mono text-xs uppercase tracking-widest",
                      decided === opt
                        ? "border-black bg-black text-white"
                        : "bg-white text-black hover:border-black",
                      i > 0 && "border-l-0",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason (writes back to GBrain)…"
                className="mt-2 w-full resize-none border border-neutral-200 bg-white px-2 py-1.5 font-mono text-xs placeholder:text-neutral-300 focus:border-black focus:outline-none"
              />
              <button
                onClick={submit}
                disabled={!decided || !reason.trim()}
                className="mt-2 w-full border border-black bg-black px-3 py-2 font-mono text-xs uppercase tracking-widest text-white disabled:opacity-30"
              >
                Commit decision
              </button>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}

function SeverityChip({ severity }: { severity: WdIncident["severity"] }) {
  const style: Record<WdIncident["severity"], string> = {
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
