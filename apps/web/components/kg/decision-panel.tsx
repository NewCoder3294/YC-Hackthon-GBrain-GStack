"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { recordDecision } from "@/app/(app)/(intel)/kg/actions";

interface Props {
  incidentId: string;
  reviewerHint?: string;
}

const OUTCOMES = [
  { value: "act" as const, label: "Act", help: "Dispatch resources" },
  { value: "hold" as const, label: "Hold", help: "Pending corroboration" },
  { value: "dismiss" as const, label: "Dismiss", help: "False positive / no action" },
];

export function DecisionPanel({ incidentId, reviewerHint }: Props) {
  const [outcome, setOutcome] = useState<"act" | "hold" | "dismiss" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!outcome) {
      setError("Pick an outcome");
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await recordDecision({
          incidentId,
          outcome,
          reason: reason.trim() ? reason.trim() : null,
          reviewer: reviewerHint ?? "dispatcher",
        });
        setSaved(true);
        setReason("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1">
        {OUTCOMES.map((o) => {
          const active = outcome === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setOutcome(o.value)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-start border px-2 py-1.5 text-left font-mono transition-colors",
                active
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 hover:border-black",
              )}
            >
              <span className="text-[10px] uppercase tracking-widest">
                {o.label}
              </span>
              <span
                className={cn(
                  "text-[9px] normal-case",
                  active ? "text-neutral-300" : "text-neutral-500",
                )}
              >
                {o.help}
              </span>
            </button>
          );
        })}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (required for Dismiss, optional otherwise)…"
        className="w-full resize-y border border-neutral-200 bg-white px-2 py-1.5 font-mono text-xs focus:border-black focus:outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !outcome}
          className="border border-black bg-black px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Write to GBrain"}
        </button>
        {saved && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Saved · record auto-written
          </span>
        )}
        {error && <span className="font-mono text-[10px] text-black">{error}</span>}
      </div>
    </div>
  );
}
