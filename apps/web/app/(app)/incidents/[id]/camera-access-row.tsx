"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

interface Props {
  cameraId: string;
  cameraLabel: string;
  incidentId: string;
  isPublic: boolean;
}

type Basis = "standing_consent" | "exigent" | "warrant";

interface RpcResult {
  event_id: string;
  allowed: boolean;
  denial_reason: string | null;
}

const DENIAL_COPY: Record<string, string> = {
  warrant_required: "blocked by owner policy — warrant required",
  blocked_incident_type: "blocked by owner policy — incident type",
  outside_time_window: "blocked by owner policy — outside allowed hours",
};

export function CameraAccessRow({
  cameraId,
  cameraLabel,
  incidentId,
  isPublic,
}: Props) {
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<Basis>("standing_consent");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RpcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(quickPublic = false) {
    if (!quickPublic && !reason.trim()) {
      setError("reason required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/incidents/${incidentId}/request-camera-access`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cameraId,
            legalBasis: quickPublic ? "standing_consent" : basis,
            reason: quickPublic
              ? "public-camera ad-hoc review"
              : reason.trim(),
          }),
        },
      );
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as RpcResult;
      setResult(json);
      setOpen(false);
    });
  }

  return (
    <div className="border border-neutral-300 p-2 font-mono text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{cameraLabel}</span>
        {isPublic ? (
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending}
            className="border border-neutral-400 px-2 py-0.5 text-[10px] uppercase tracking-widest hover:border-black disabled:opacity-50"
          >
            {pending ? "..." : "Pull public"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={pending}
            className="border border-neutral-400 px-2 py-0.5 text-[10px] uppercase tracking-widest hover:border-black"
          >
            {open ? "Cancel" : "Request footage"}
          </button>
        )}
      </div>

      {open && !isPublic && (
        <div className="mt-2 space-y-2">
          <fieldset className="space-y-1">
            <legend className="text-[9px] uppercase tracking-widest text-neutral-500">
              Legal basis
            </legend>
            {(["standing_consent", "exigent", "warrant"] as Basis[]).map((b) => (
              <label
                key={b}
                className="flex items-center gap-2 text-[10px]"
              >
                <input
                  type="radio"
                  name={`basis-${cameraId}`}
                  checked={basis === b}
                  onChange={() => setBasis(b)}
                />
                {b.replace(/_/g, " ")}
              </label>
            ))}
          </fieldset>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="reason / incident reference"
            className="w-full border border-neutral-300 p-1 text-[11px]"
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={pending}
            className={cn(
              "border px-2 py-1 text-[10px] uppercase tracking-widest",
              pending
                ? "border-neutral-300 text-neutral-400"
                : "border-black bg-black text-white",
            )}
          >
            {pending ? "Requesting..." : "Submit request"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-[10px] text-neutral-700">error: {error}</p>
      )}
      {result && (
        <p
          className={cn(
            "mt-1 border-l-2 pl-2 text-[10px]",
            result.allowed ? "border-black" : "border-neutral-700 italic",
          )}
        >
          {result.allowed
            ? "allowed — clip available"
            : `denied: ${
                DENIAL_COPY[result.denial_reason ?? ""] ?? result.denial_reason
              }`}
        </p>
      )}
    </div>
  );
}
