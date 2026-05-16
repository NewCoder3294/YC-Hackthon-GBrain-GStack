"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Channel = "mobile" | "web";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; reportId: string }
  | { kind: "error"; message: string };

function detectChannel(): Channel {
  if (typeof window === "undefined") return "web";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const smallViewport = window.matchMedia("(max-width: 640px)").matches;
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  return coarse || (smallViewport && touch) ? "mobile" : "web";
}

export function ReportForm() {
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [channel, setChannel] = useState<Channel>("web");
  const [geoState, setGeoState] = useState<"idle" | "locating" | "ok" | "denied">(
    "idle",
  );
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    setChannel(detectChannel());

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("denied");
      return;
    }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGeoState("ok");
      },
      () => {
        // Permission denied or unavailable — manual entry remains available.
        setGeoState("denied");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const submitting = status.kind === "submitting";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (description.trim().length === 0) {
      setStatus({ kind: "error", message: "Please describe what you saw." });
      return;
    }
    if (lat.trim().length === 0 || lng.trim().length === 0) {
      setStatus({
        kind: "error",
        message:
          "Location is required. Allow location access or enter coordinates manually.",
      });
      return;
    }

    setStatus({ kind: "submitting" });

    const body = new FormData();
    body.set("description", description.trim());
    body.set("lat", lat.trim());
    body.set("lng", lng.trim());
    body.set("channel", channel);
    if (contact.trim().length > 0) body.set("contact", contact.trim());
    if (photo) body.set("photo", photo);

    try {
      const res = await fetch("/api/report", { method: "POST", body });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : `Submission failed (${res.status})`;
        setStatus({ kind: "error", message });
        return;
      }

      const reportId =
        data && typeof data === "object" && "reportId" in data
          ? String((data as { reportId: unknown }).reportId)
          : "unknown";
      setStatus({ kind: "success", reportId });
    } catch {
      setStatus({
        kind: "error",
        message: "Network error — please try again.",
      });
    }
  }

  if (status.kind === "success") {
    return (
      <div
        role="status"
        className="space-y-3 border border-neutral-200 bg-white p-5 font-mono text-sm"
      >
        <p className="text-black">Report received. Thank you.</p>
        <p className="break-all text-xs text-neutral-500">
          Reference: {status.reportId}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDescription("");
            setContact("");
            setPhoto(null);
            setStatus({ kind: "idle" });
          }}
        >
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <label className="block space-y-1">
        <span className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          What did you see? <span aria-hidden="true">*</span>
        </span>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          rows={4}
          placeholder="Describe the incident, location landmarks, hazards…"
          className="w-full resize-y border border-neutral-200 bg-white px-3 py-2 font-mono text-sm placeholder:text-neutral-300 focus:border-black focus:outline-none disabled:opacity-40"
        />
      </label>

      <label className="block space-y-1">
        <span className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Photo (optional)
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={submitting}
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="block w-full font-mono text-xs text-neutral-600 file:mr-3 file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1 file:font-mono file:text-xs file:uppercase file:tracking-widest disabled:opacity-40"
        />
      </label>

      <fieldset className="space-y-2" disabled={submitting}>
        <legend className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Location{" "}
          {geoState === "locating" && (
            <span className="text-neutral-400">(locating…)</span>
          )}
          {geoState === "ok" && (
            <span className="text-neutral-400">(auto-detected)</span>
          )}
          {geoState === "denied" && (
            <span className="text-neutral-400">(enter manually)</span>
          )}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="block font-mono text-[10px] text-neutral-400">
              Latitude
            </span>
            <Input
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="37.7749"
              aria-label="Latitude"
            />
          </label>
          <label className="block space-y-1">
            <span className="block font-mono text-[10px] text-neutral-400">
              Longitude
            </span>
            <Input
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="-122.4194"
              aria-label="Longitude"
            />
          </label>
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Contact (optional)
        </span>
        <Input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          disabled={submitting}
          placeholder="Email or phone, if you want follow-up"
          aria-label="Contact"
        />
      </label>

      {status.kind === "error" && (
        <p role="alert" className="font-mono text-xs text-black">
          {status.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? "Submitting…" : "Submit report"}
      </Button>
    </form>
  );
}
