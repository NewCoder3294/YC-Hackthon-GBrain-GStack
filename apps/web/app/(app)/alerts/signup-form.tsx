"use client";

import { useState, useTransition } from "react";

// SF neighborhoods that show up most often in the live feed.
const NEIGHBORHOODS = [
  "Bayview",
  "Castro",
  "Chinatown",
  "Excelsior",
  "Financial District",
  "Glen Park",
  "Hayes Valley",
  "Inner Richmond",
  "Inner Sunset",
  "Marina",
  "Mission",
  "Nob Hill",
  "Noe Valley",
  "North Beach",
  "Outer Richmond",
  "Outer Sunset",
  "Pacific Heights",
  "Potrero Hill",
  "Russian Hill",
  "SOMA",
  "Tenderloin",
  "Visitacion Valley",
  "Western Addition",
];

type Severity = "low" | "med" | "high";

const SEVERITY_OPTIONS: { v: Severity; label: string; desc: string }[] = [
  { v: "low", label: "Low+", desc: "everything (noise warning)" },
  { v: "med", label: "Med+", desc: "real incidents, recommended" },
  { v: "high", label: "High only", desc: "violence / officer-down only" },
];

export function AlertsSignupForm() {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [severity, setSeverity] = useState<Severity>("med");
  const [status, setStatus] = useState<"idle" | "ok" | "duplicate" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(n: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("idle");
    startTransition(async () => {
      try {
        const res = await fetch("/api/alerts/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            neighborhoods: Array.from(selected),
            minSeverity: severity,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus("error");
          setError(body?.error ?? `subscribe_failed_${res.status}`);
          return;
        }
        setStatus(body?.duplicate ? "duplicate" : "ok");
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "network_error");
      }
    });
  }

  if (status === "ok") {
    return (
      <div className="border border-black bg-neutral-50 p-6 text-center">
        <p className="font-mono text-sm font-medium">You're in.</p>
        <p className="mt-2 text-sm text-neutral-600">
          We'll email <span className="font-mono">{email}</span> when a{" "}
          <span className="font-mono">{severity}+</span> incident lands in{" "}
          {selected.size === 0
            ? "any SF neighborhood"
            : `${selected.size} selected neighborhood${selected.size === 1 ? "" : "s"}`}.
        </p>
      </div>
    );
  }

  if (status === "duplicate") {
    return (
      <div className="border border-neutral-300 bg-neutral-50 p-6 text-center">
        <p className="font-mono text-sm">Already subscribed.</p>
        <p className="mt-2 text-sm text-neutral-600">
          <span className="font-mono">{email}</span> is already on the list.
          Use the unsubscribe link in any past email if you'd like to change
          your preferences.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Email
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Neighborhoods · empty = all SF
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {NEIGHBORHOODS.map((n) => {
            const active = selected.has(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggle(n)}
                className={`border px-2 py-1 font-mono text-xs ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white text-neutral-600 hover:border-black hover:text-black"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Minimum severity
        </legend>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          {SEVERITY_OPTIONS.map((opt) => {
            const active = severity === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setSeverity(opt.v)}
                className={`flex flex-1 flex-col border px-3 py-2 text-left ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white hover:border-black"
                }`}
              >
                <span className="font-mono text-xs uppercase tracking-widest">
                  {opt.label}
                </span>
                <span
                  className={`mt-0.5 font-mono text-[10px] ${
                    active ? "text-neutral-300" : "text-neutral-500"
                  }`}
                >
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {status === "error" && (
        <p className="font-mono text-xs text-black">
          Sign-up failed: {error ?? "unknown error"}. Try again in a minute.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || email.trim().length === 0}
        className="w-full border border-black bg-black px-4 py-2 font-mono text-sm uppercase tracking-widest text-white hover:bg-white hover:text-black disabled:opacity-40 sm:w-auto"
      >
        {pending ? "Subscribing…" : "Subscribe"}
      </button>
    </form>
  );
}
