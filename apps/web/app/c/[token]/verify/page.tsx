"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Route } from "next";

export default function VerifyPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/contribute/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: params.token, code }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "verification failed");
      return;
    }
    router.push((`/c/${params.token}`) as Route);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-3 border border-neutral-200 p-8"
      >
        <h1 className="font-mono text-sm uppercase tracking-widest">Verify your phone</h1>
        <p className="font-mono text-xs text-neutral-500">
          We sent a 6-digit code to the number on file.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          required
          className="w-full border border-neutral-200 px-3 py-2 text-center font-mono text-2xl tracking-widest focus:border-black focus:outline-none"
        />
        {error && <p className="font-mono text-xs text-black">{error}</p>}
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full border border-black bg-black px-3 py-2 font-mono text-xs uppercase tracking-widest text-white disabled:opacity-40"
        >
          {loading ? "Checking…" : "Confirm"}
        </button>
      </form>
    </main>
  );
}
