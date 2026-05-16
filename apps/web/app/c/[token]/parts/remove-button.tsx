"use client";

import { useState } from "react";

export function RemoveButton({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  async function remove() {
    const res = await fetch("/api/contribute/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      setDone(true);
      setTimeout(() => (window.location.href = "/"), 1500);
    }
  }

  if (done) {
    return <p className="mt-3 font-mono text-xs text-neutral-500">Removed. Redirecting…</p>;
  }
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 border border-neutral-300 px-3 py-2 font-mono text-xs uppercase tracking-widest hover:border-black"
      >
        Remove me from the network
      </button>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        onClick={remove}
        className="border border-black bg-black px-3 py-2 font-mono text-xs uppercase tracking-widest text-white"
      >
        Confirm removal
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="border border-neutral-300 px-3 py-2 font-mono text-xs uppercase tracking-widest hover:border-black"
      >
        Cancel
      </button>
    </div>
  );
}
