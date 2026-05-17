import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · WatchDog",
  description:
    "WatchDog's privacy and data-handling policy. We don't collect personal data, we don't sell anything, and every source we display is already public.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 text-neutral-800">
      <header className="space-y-2 border-b border-neutral-200 pb-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Privacy
        </p>
        <h1 className="font-mono text-2xl uppercase tracking-tight">
          We don't want your data.
        </h1>
        <p className="text-sm text-neutral-500">Updated 2026-05-17</p>
      </header>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Anonymous analytics.</strong> Vercel Analytics records
            page views with no IP retention, no cookies, no cross-site
            tracking. We use it to see which pages get traffic. You can
            block it with any ad-blocker.
          </li>
          <li>
            <strong>Optional account.</strong> If you sign up as an operator
            or a camera contributor, we store your email and (for
            contributors) phone number. Both are used solely to authenticate
            you and to send notifications you opt into.
          </li>
        </ul>
      </Section>

      <Section title="What we don't collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>No location tracking on viewers.</li>
          <li>No browser fingerprinting.</li>
          <li>No facial recognition. Ever. See <Link href="/about" className="underline">About</Link>.</li>
          <li>No tracking cookies. The only cookies set are Supabase auth cookies, and only after you sign in.</li>
        </ul>
      </Section>

      <Section title="What we display">
        Every dataset on WatchDog is public. SFPD CAD, SFFD calls, 311
        reports, 511 traffic, Caltrans camera streams, and neighborhood
        news are all published by their respective agencies or outlets. We
        re-render them in one place; we don't add anything that wasn't
        already publicly available.
      </Section>

      <Section title="Camera contributors">
        If you opt to enroll a camera through <Link href="/contribute" className="underline">/contribute</Link>,
        we store the metadata you provide (camera location, contact info,
        policy preferences) plus a hash of your phone number for the SMS
        verification flow. Every access against your camera is logged and
        viewable to you in your contributor dashboard.
      </Section>

      <Section title="Third parties">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Supabase</strong> — database + auth provider.</li>
          <li><strong>Vercel</strong> — hosting + analytics.</li>
          <li><strong>Twilio</strong> — SMS verification + notifications (only when you opt in).</li>
          <li><strong>Anthropic</strong> — Claude API for incident summarization (operator-side only).</li>
        </ul>
      </Section>

      <Section title="Contact">
        Email <a href="mailto:hello@watchdog.sf" className="underline">hello@watchdog.sf</a> with any
        question, takedown request, or data export request. We aim to
        respond within 72 hours.
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 text-sm leading-relaxed">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}
