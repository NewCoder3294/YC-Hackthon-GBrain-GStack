"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace((params.get("next") ?? "/") as Route);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="font-mono text-sm tracking-tight">CalTrans CCTV</h1>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-neutral-500">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full border border-neutral-200 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-wide text-neutral-500">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full border border-neutral-200 px-3 py-2 font-mono text-sm focus:border-black focus:outline-none"
        />
      </label>
      {error && <p className="font-mono text-xs text-black">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full border border-black bg-black px-3 py-2 font-mono text-sm text-white disabled:opacity-40"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
