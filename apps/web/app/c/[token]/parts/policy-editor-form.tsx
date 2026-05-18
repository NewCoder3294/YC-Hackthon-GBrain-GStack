"use client";

import { useState, useTransition } from "react";

interface PolicyState {
  geofence_radius_m: number;
  window_start_local: string | null;
  window_end_local: string | null;
  warrant_required: boolean;
  exigent_allowed: boolean;
  blocked_incident_types: string[];
}

interface CameraPolicy {
  cameraId: string;
  description: string;
  policy: PolicyState & { camera_id: string };
}

const PROFILES: { key: "strict" | "balanced" | "permissive"; label: string; desc: string; apply: PolicyState }[] = [
  {
    key: "strict",
    label: "Strict",
    desc: "Warrant required. No standing consent.",
    apply: {
      geofence_radius_m: 250,
      window_start_local: null,
      window_end_local: null,
      warrant_required: true,
      exigent_allowed: true,
      blocked_incident_types: [],
    },
  },
  {
    key: "balanced",
    label: "Balanced",
    desc: "Standing consent within 500m, exigent always allowed.",
    apply: {
      geofence_radius_m: 500,
      window_start_local: null,
      window_end_local: null,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: [],
    },
  },
  {
    key: "permissive",
    label: "Permissive",
    desc: "1km radius, 24/7, all incident types.",
    apply: {
      geofence_radius_m: 1000,
      window_start_local: null,
      window_end_local: null,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: [],
    },
  },
];

const BLOCKABLE_TYPES = ["traffic", "noise", "minor", "311"];

export function PolicyEditorForm({
  token,
  cameras,
}: {
  token: string;
  cameras: CameraPolicy[];
}) {
  const [selectedCameraId, setSelectedCameraId] = useState(cameras[0]?.cameraId ?? "");
  const initial = cameras.find((c) => c.cameraId === selectedCameraId)?.policy;
  const [state, setState] = useState<PolicyState>({
    geofence_radius_m: initial?.geofence_radius_m ?? 500,
    window_start_local: initial?.window_start_local ?? null,
    window_end_local: initial?.window_end_local ?? null,
    warrant_required: initial?.warrant_required ?? false,
    exigent_allowed: initial?.exigent_allowed ?? true,
    blocked_incident_types: initial?.blocked_incident_types ?? [],
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload(cameraId: string) {
    const found = cameras.find((c) => c.cameraId === cameraId)?.policy;
    if (!found) return;
    setState({
      geofence_radius_m: found.geofence_radius_m,
      window_start_local: found.window_start_local,
      window_end_local: found.window_end_local,
      warrant_required: found.warrant_required,
      exigent_allowed: found.exigent_allowed,
      blocked_incident_types: found.blocked_incident_types,
    });
    setSaved(false);
    setError(null);
  }

  function applyProfile(p: PolicyState) {
    setState({ ...p });
    setSaved(false);
  }

  function toggleType(t: string) {
    setState((s) => ({
      ...s,
      blocked_incident_types: s.blocked_incident_types.includes(t)
        ? s.blocked_incident_types.filter((x) => x !== t)
        : [...s.blocked_incident_types, t],
    }));
    setSaved(false);
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/contribute/policy?token=${encodeURIComponent(token)}&cameraId=${encodeURIComponent(selectedCameraId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(state),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error ?? `save_failed_${res.status}`);
          return;
        }
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "network_error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Camera
        </span>
        <select
          value={selectedCameraId}
          onChange={(e) => {
            setSelectedCameraId(e.target.value);
            reload(e.target.value);
          }}
          className="mt-1 block w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        >
          {cameras.map((c) => (
            <option key={c.cameraId} value={c.cameraId}>
              {c.description}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Quick profile
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {PROFILES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyProfile(p.apply)}
              className="flex flex-1 flex-col border border-neutral-300 px-3 py-2 text-left hover:border-black"
            >
              <span className="font-mono text-xs font-medium uppercase tracking-widest">
                {p.label}
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-neutral-500">
                {p.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Geofence radius (meters)
        </span>
        <div className="mt-1 flex items-center gap-3">
          <input
            type="range"
            min={50}
            max={5000}
            step={50}
            value={state.geofence_radius_m}
            onChange={(e) => {
              setState((s) => ({ ...s, geofence_radius_m: Number(e.target.value) }));
              setSaved(false);
            }}
            className="flex-1"
          />
          <span className="w-20 text-right font-mono text-xs tabular-nums">
            {state.geofence_radius_m} m
          </span>
        </div>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Quiet window start (local)
          </span>
          <input
            type="time"
            value={state.window_start_local ?? ""}
            onChange={(e) => {
              setState((s) => ({ ...s, window_start_local: e.target.value || null }));
              setSaved(false);
            }}
            className="mt-1 block w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Quiet window end (local)
          </span>
          <input
            type="time"
            value={state.window_end_local ?? ""}
            onChange={(e) => {
              setState((s) => ({ ...s, window_end_local: e.target.value || null }));
              setSaved(false);
            }}
            className="mt-1 block w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
          />
        </label>
      </div>
      <p className="font-mono text-[10px] text-neutral-400">
        Set both to restrict access to the window. Leave both blank for 24/7.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 border border-neutral-300 px-3 py-2">
          <input
            type="checkbox"
            checked={state.warrant_required}
            onChange={(e) => {
              setState((s) => ({ ...s, warrant_required: e.target.checked }));
              setSaved(false);
            }}
          />
          <span className="font-mono text-xs">Warrant required</span>
        </label>
        <label className="flex items-center gap-2 border border-neutral-300 px-3 py-2">
          <input
            type="checkbox"
            checked={state.exigent_allowed}
            onChange={(e) => {
              setState((s) => ({ ...s, exigent_allowed: e.target.checked }));
              setSaved(false);
            }}
          />
          <span className="font-mono text-xs">Allow exigent access</span>
        </label>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Block these incident types
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {BLOCKABLE_TYPES.map((t) => {
            const active = state.blocked_incident_types.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`border px-2 py-1 font-mono text-xs ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white text-neutral-600 hover:border-black"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="font-mono text-xs text-black">{error}</p>}
      {saved && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-black">
          Saved · applies to next query
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="border border-black bg-black px-4 py-2 font-mono text-sm uppercase tracking-widest text-white hover:bg-white hover:text-black disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save policy"}
      </button>
    </div>
  );
}
