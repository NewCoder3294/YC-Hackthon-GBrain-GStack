"use client";

import { useState, useTransition } from "react";
import { disconnectBridge } from "./disconnect-bridge-action";

export function DisconnectBridgeButton({
  token,
  bridgeId,
}: {
  token: string;
  bridgeId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 underline-offset-2 hover:underline"
      >
        Unpair
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await disconnectBridge(token, bridgeId);
            if (!r.ok) setErr(r.error);
            else setConfirming(false);
          })
        }
        className="border border-black px-2 py-1 font-mono text-[10px] uppercase tracking-widest disabled:opacity-40"
      >
        {pending ? "…" : "Confirm unpair"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="font-mono text-[10px] uppercase tracking-widest text-neutral-500"
      >
        Cancel
      </button>
      {err && (
        <span className="font-mono text-[10px] text-black">{err}</span>
      )}
    </div>
  );
}
