import type { Metadata } from "next";
import { AlertsSignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Email alerts · WatchDog",
  description:
    "Get an email when something significant happens in your SF neighborhood. Free, no account required, one-click unsubscribe.",
};

export default function AlertsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-neutral-800">
      <header className="space-y-2 border-b border-neutral-200 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Alerts
        </p>
        <h1 className="font-mono text-2xl uppercase tracking-tight">
          Get pinged when something happens nearby.
        </h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          Pick the neighborhoods you care about. We'll email when a new
          incident lands that meets the severity threshold. No account
          needed. One click unsubscribes. We never sell your email.
        </p>
      </header>

      <AlertsSignupForm />

      <section className="space-y-2 border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-500">
        <p>
          Alerts are sourced from SFPD CAD, SFFD/EMS, 311, 511, and SF
          neighborhood news. Same data shown on the public{" "}
          <a href="/map" className="underline">map</a> and{" "}
          <a href="/live" className="underline">live</a> views.
        </p>
        <p>
          Read our <a href="/privacy" className="underline">privacy policy</a>.
        </p>
      </section>
    </article>
  );
}
