"use client";

import { useState, useTransition } from "react";
import { acknowledgeAlert } from "@/app/(app)/(intel)/kg/actions";

interface Props {
  alertId: string;
  alreadyAcked: boolean;
}

export function AckButton({ alertId, alreadyAcked }: Props) {
  const [acked, setAcked] = useState(alreadyAcked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ack() {
    setError(null);
    startTransition(async () => {
      try {
        await acknowledgeAlert({ alertId });
        setAcked(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  if (acked) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        ✓ Acknowledged
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={ack}
        disabled={pending}
        className="w-full border border-black bg-black px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white disabled:opacity-40"
      >
        {pending ? "Acknowledging…" : "Acknowledge alert"}
      </button>
      {error && <p className="font-mono text-[10px] text-black">{error}</p>}
    </div>
  );
}
