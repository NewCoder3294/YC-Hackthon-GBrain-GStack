"use client";

import { useTransition } from "react";
import { refreshPairingCode } from "./refresh-action";

export function RefreshButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        start(async () => {
          await refreshPairingCode(token);
        })
      }
      disabled={pending}
      className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 underline-offset-2 hover:underline disabled:opacity-40"
    >
      {pending ? "Refreshing…" : "Refresh code"}
    </button>
  );
}
