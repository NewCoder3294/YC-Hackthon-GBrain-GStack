"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

export function RegistrationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+1");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const advancedFilled = showAdvanced && streamUrl && lat && lng;
    const res = await fetch("/api/contribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        contact_phone: phone,
        ...(advancedFilled
          ? { lat: Number(lat), lng: Number(lng), stream_url: streamUrl }
          : {}),
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "registration failed");
      return;
    }
    const verifyPath = new URL(json.verify_url).pathname as Route;
    router.push(verifyPath);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Business name" value={name} onChange={setName} required />
      <Field
        label="Phone (E.164)"
        value={phone}
        onChange={setPhone}
        required
        placeholder="+14155551212"
      />
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        After SMS verification, install the WatchDog app on a phone at your
        shop. It auto-discovers your cameras on WiFi — no router config.
      </p>

      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 underline-offset-2 hover:underline"
      >
        {showAdvanced ? "Hide" : "Advanced: I already have a public stream URL"}
      </button>

      {showAdvanced && (
        <div className="space-y-3 border-l-2 border-neutral-200 pl-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude" value={lat} onChange={setLat} />
            <Field label="Longitude" value={lng} onChange={setLng} />
          </div>
          <Field
            label="Stream URL (.m3u8 or .jpg)"
            value={streamUrl}
            onChange={setStreamUrl}
          />
        </div>
      )}

      {error && <p className="font-mono text-xs text-black">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full border border-black bg-black px-3 py-2 font-mono text-xs uppercase tracking-widest text-white disabled:opacity-40"
      >
        {loading ? "Registering…" : "Register & text me a code"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full border border-neutral-200 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
      />
    </label>
  );
}
