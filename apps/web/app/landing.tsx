"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

type SourceType = "camera" | "call" | "citizen" | "shotspotter";
type Severity = "low" | "med" | "high";

interface Signal {
  id: number;
  ts: string;
  source: SourceType;
  location: string;
  detail: string;
  severity: Severity;
}

const SCENARIO: Omit<Signal, "id" | "ts">[] = [
  { source: "camera", location: "MISSION & 16TH", detail: "pose: fighting · 0.87", severity: "med" },
  { source: "call", location: "MISSION & 16TH", detail: "911 hangup", severity: "med" },
  { source: "shotspotter", location: "MISSION & 16TH", detail: "single report", severity: "high" },
  { source: "citizen", location: "MISSION & 16TH", detail: "\"two men arguing\"", severity: "high" },
];

const SOURCE_GLYPH: Record<SourceType, string> = {
  camera: "CAM",
  call: "911",
  citizen: "RPT",
  shotspotter: "SHT",
};

const ROUTES = [
  "I-880 E", "I-880 W", "I-80 E", "I-80 W", "I-280 N", "I-280 S",
  "US-101 N", "US-101 S", "I-580 E", "I-580 W", "I-680 N", "I-680 S",
  "CA-13 N", "CA-13 S", "CA-92 E", "CA-92 W", "I-238", "CA-24", "CA-87",
];

function pad(n: number, w = 2) {
  return n.toString().padStart(w, "0");
}

function fmtTime(d: Date) {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function Landing() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-white text-black">
      <Header />
      <Hero />
      <Pillars />
      <NotSection />
      <ClosingCta />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <Image
          src="/watchdog.png"
          alt=""
          width={22}
          height={22}
          priority
          className="rounded-sm"
        />
        <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em]">
          WatchDog
        </span>
      </div>
      <Clock />
      <Link
        href={"/wall" as Route}
        className="border border-black bg-black px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
      >
        Open dispatcher →
      </Link>
    </header>
  );
}

function Clock() {
  const [t, setT] = useState<string>("");
  useEffect(() => {
    const tick = () => setT(fmtTime(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500 md:flex">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-black"
        style={{ animation: "wd-pulse-dot 1.6s ease-in-out infinite" }}
      />
      <span>SFPD · RTCC · {t} UTC</span>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative border-b border-neutral-200">
      <div className="wd-grid pointer-events-none absolute inset-0" aria-hidden />
      <ScanLine />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-28 lg:pt-24">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            San Francisco · Real-Time Crime Center
          </p>
          <h1 className="mt-6 font-mono text-3xl leading-[1.1] tracking-tight md:text-5xl">
            <FlashWord>One ranked queue.</FlashWord>
            <br />
            <span className="text-neutral-400">Every signal correlated.</span>
            <br />
            <FlashWord delay={1200}>Every query auditable.</FlashWord>
          </h1>
          <p className="mt-8 max-w-xl font-mono text-sm leading-relaxed text-neutral-700">
            A 911 hangup, a streetlight camera detection, a citizen report, a
            ShotSpotter ping — today they sit in four systems watched by four
            humans. WatchDog correlates them into one dispatcher view, with
            institutional memory of every prior incident and symmetric
            transparency for the camera owners whose feeds are being queried.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href={"/wall" as Route}
              className="border border-black bg-black px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
            >
              Open dispatcher view →
            </Link>
            <a
              href="#how"
              className="border border-neutral-300 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-black transition-colors hover:border-black"
            >
              How it works
            </a>
          </div>
          <StatStrip />
        </div>
        <SignalFeed />
      </div>
      <Marquee />
    </section>
  );
}

function ScanLine() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-black/40"
      style={{ animation: "wd-scan 7s linear infinite" }}
    />
  );
}

function FlashWord({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        opacity: 0,
        animation: `wd-fade-up 700ms ease-out forwards`,
        animationDelay: `${delay}ms`,
      }}
    >
      {children}
    </span>
  );
}

function StatStrip() {
  return (
    <div className="mt-12 grid grid-cols-3 gap-px border border-neutral-200 bg-neutral-200">
      <Stat label="Cameras online" target={1186} />
      <Stat label="Signals fused / 7d" target={23471} />
      <Stat label="Queries audited" target={414} />
    </div>
  );
}

function Stat({ label, target }: { label: string; target: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || triggered.current) return;
        triggered.current = true;
        const start = performance.now();
        const dur = 1400;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          setN(Math.round(target * eased));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  return (
    <div ref={ref} className="bg-white p-4">
      <div className="font-mono text-xl tracking-tight tabular-nums md:text-2xl">
        {n.toLocaleString()}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
    </div>
  );
}

function Marquee() {
  const items = useMemo(() => [...ROUTES, ...ROUTES], []);
  return (
    <div className="relative overflow-hidden border-t border-neutral-200 bg-white py-3">
      <div
        className="flex w-max gap-12 whitespace-nowrap"
        style={{ animation: "wd-marquee 40s linear infinite" }}
      >
        {items.map((r, i) => (
          <span
            key={`${r}-${i}`}
            className="font-mono text-[10px] uppercase tracking-widest text-neutral-400"
          >
            <span className="mr-2 text-black">●</span>
            CalTrans D4 · {r}
          </span>
        ))}
      </div>
    </div>
  );
}

function SignalFeed() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [fused, setFused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const counterRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    function pushOne(s: Omit<Signal, "id" | "ts">) {
      if (cancelled) return;
      counterRef.current += 1;
      const ts = fmtTime(new Date());
      setSignals((prev) => [{ ...s, id: counterRef.current, ts }, ...prev].slice(0, 6));
    }

    async function run() {
      while (!cancelled) {
        setSignals([]);
        setFused(false);
        setDismissed(false);
        await wait(900);
        for (const s of SCENARIO) {
          if (cancelled) return;
          pushOne(s);
          await wait(1500 + Math.random() * 800);
        }
        await wait(900);
        if (cancelled) return;
        setFused(true);
        await wait(2600);
        if (cancelled) return;
        setDismissed(true);
        await wait(1800);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const severity: Severity = fused ? "high" : "med";

  return (
    <div className="relative">
      <div className="absolute -inset-1 -z-10 bg-neutral-100/50" aria-hidden />
      <div className="border border-black bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-black"
              style={{ animation: "wd-pulse-dot 1.4s ease-in-out infinite" }}
            />
            Dispatcher queue · live
          </span>
          <span>signals · {signals.length}</span>
        </div>

        {fused && (
          <FusedIncident
            severity={severity}
            count={SCENARIO.length}
            dismissed={dismissed}
          />
        )}

        <ul className="divide-y divide-neutral-200">
          {signals.length === 0 && !fused && (
            <li className="px-3 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-300">
              awaiting signals
            </li>
          )}
          {signals.map((s) => (
            <li
              key={s.id}
              className="px-3 py-2.5"
              style={{ animation: "wd-slide-in 420ms ease-out both" }}
            >
              <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
                <span className="flex items-baseline gap-3 truncate">
                  <span className="text-neutral-400">{s.ts}</span>
                  <span className="border border-black px-1 py-0.5 text-[9px] uppercase tracking-widest">
                    {SOURCE_GLYPH[s.source]}
                  </span>
                  <span className="truncate text-black">{s.location}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  {s.detail}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <Caret /> correlator window · 200m · 60s
        </div>
      </div>
    </div>
  );
}

function FusedIncident({
  severity,
  count,
  dismissed,
}: {
  severity: Severity;
  count: number;
  dismissed: boolean;
}) {
  return (
    <div
      className="border-b border-black bg-black px-3 py-3 text-white"
      style={{ animation: "wd-slide-in 480ms ease-out both" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-widest">
          <span className="border border-white px-1 py-0.5 text-[9px]">
            {severity}
          </span>
          Possible assault · Mission & 16th
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
          {count} signals
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
        <span>
          GBrain: 4 dismissed at this corner / 30d · bar-closing crowd
        </span>
        <span className="text-white">
          {dismissed ? "→ dispatcher held" : "→ awaiting decision"}
        </span>
      </div>
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="mr-1 inline-block w-1.5 text-black"
      style={{ animation: "wd-blink 1.2s steps(1, end) infinite" }}
    >
      ▌
    </span>
  );
}

function Pillars() {
  return (
    <section id="how" className="border-b border-neutral-200 bg-neutral-50/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          What's different
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-px bg-neutral-200 md:grid-cols-3">
          <Pillar
            n="01"
            title="Fusion"
            body="Camera detections, 911 transcripts, and citizen reports join in spatial-temporal windows. Dispatchers see one ranked incident instead of four siloed alerts."
            delay={0}
          />
          <Pillar
            n="02"
            title="Memory"
            body="Every reviewed incident, dismissal reason, and neighborhood baseline is written to GBrain. The next similar signal arrives with prior context already attached."
            delay={120}
          />
          <Pillar
            n="03"
            title="Consent"
            body="Camera owners control geofence, time windows, incident types, and warrant requirements as policy-as-code. Every query — allowed or denied — is in their audit log."
            delay={240}
          />
        </div>
      </div>
    </section>
  );
}

function Pillar({
  n,
  title,
  body,
  delay,
}: {
  n: string;
  title: string;
  body: string;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="group relative bg-white p-8 transition-colors hover:bg-black hover:text-white"
      style={{
        opacity: shown ? 1 : 0,
        animation: shown
          ? `wd-fade-up 700ms ease-out ${delay}ms forwards`
          : undefined,
      }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-sm font-semibold uppercase tracking-widest">
          {title}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300 group-hover:text-neutral-500">
          {n}
        </span>
      </div>
      <p className="mt-4 font-mono text-sm leading-relaxed text-neutral-700 group-hover:text-neutral-200">
        {body}
      </p>
    </div>
  );
}

function NotSection() {
  return (
    <section className="border-b border-neutral-200">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          What we are not
        </h2>
        <ul className="mt-6 space-y-3 font-mono text-sm text-neutral-700">
          <NotLine label="Not predictive policing." delay={0}>
            We surface signals and prior context about places and patterns. We
            do not score people.
          </NotLine>
          <NotLine label="Not facial recognition." delay={120}>
            California AB 1215. Not in v1, not on the roadmap.
          </NotLine>
          <NotLine label="Not a black box." delay={240}>
            Camera owners see every access event against their feed, with full
            provenance.
          </NotLine>
        </ul>
      </div>
    </section>
  );
}

function NotLine({
  label,
  children,
  delay,
}: {
  label: string;
  children: React.ReactNode;
  delay: number;
}) {
  const ref = useRef<HTMLLIElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <li
      ref={ref}
      className="border-l border-neutral-300 pl-4"
      style={{
        opacity: shown ? 1 : 0,
        animation: shown
          ? `wd-fade-up 700ms ease-out ${delay}ms forwards`
          : undefined,
      }}
    >
      <span className="font-semibold text-black">{label}</span>{" "}
      <span className="text-neutral-700">{children}</span>
    </li>
  );
}

function ClosingCta() {
  return (
    <section className="border-b border-neutral-200 bg-neutral-50/60">
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <p className="font-mono text-sm text-neutral-700">
          For dispatchers, by way of the homeowner whose camera is being queried.
        </p>
        <Link
          href={"/wall" as Route}
          className="mt-6 inline-block border border-black bg-black px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
        >
          Open dispatcher →
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-6 py-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        <span>WatchDog · GStack × GBrain hackathon · 2026</span>
        <span>SFPD demo build · No real footage stored</span>
      </div>
    </footer>
  );
}

function wait(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
