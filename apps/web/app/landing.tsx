"use client";

import { useEffect, useRef, useState } from "react";
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
];

const SOURCE_GLYPH: Record<SourceType, string> = {
  camera: "CAM",
  call: "911",
  citizen: "RPT",
  shotspotter: "SHT",
};

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
      <HookStat />
      <HowItWorks />
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
          <YCBadge />
          <p className="mt-5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
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
            Three live feeds — SFPD scanner, SF cameras, SFGov dispatch —
            in one operator view, with memory of every prior incident.{" "}
            <span className="text-black">All data on this site is real,
            pulled live.</span>
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
    </section>
  );
}

// IntersectionObserver hook. Returns [ref, inView]. `inView` flips true
// the first time the element enters the viewport and stays true (so the
// reveal animation plays exactly once when the user scrolls past).
function useInView<T extends Element>(
  options: IntersectionObserverInit = { threshold: 0.25 },
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, options);
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, inView];
}

function HookStat() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });

  // Slide-in choreography. Each line picks up a stagger delay so the
  // viewer's eye is pulled left-to-right (kicker -> 62% -> rest).
  const fadeUp = (delay: number) => ({
    opacity: inView ? 1 : 0,
    transform: inView ? "translateY(0)" : "translateY(16px)",
    transition: `opacity 700ms ease-out ${delay}ms, transform 700ms ease-out ${delay}ms`,
  });
  const slideInBig = inView
    ? {
        opacity: 1,
        transform: "translateX(0) scale(1)",
        transition:
          "opacity 800ms cubic-bezier(0.16, 1, 0.3, 1) 120ms, transform 800ms cubic-bezier(0.16, 1, 0.3, 1) 120ms",
      }
    : { opacity: 0, transform: "translateX(-160px) scale(0.7)" };

  return (
    <section className="border-b border-neutral-200 bg-black text-white overflow-hidden">
      <div ref={ref} className="mx-auto max-w-4xl px-6 py-20 text-center md:py-28">
        <p
          className="font-mono text-xs uppercase tracking-[0.25em] text-neutral-400 md:text-sm"
          style={fadeUp(0)}
        >
          Why this exists
        </p>
        <p className="mt-6 font-mono text-3xl leading-[1.15] tracking-tight md:text-5xl">
          <span
            className="block tabular-nums text-white md:text-[7rem] md:leading-none"
            style={{ fontVariantNumeric: "tabular-nums", ...slideInBig }}
          >
            62%
          </span>
          <span
            className="mt-4 block text-neutral-300 md:text-4xl"
            style={fadeUp(420)}
          >
            of violent crimes in major urban areas go completely{" "}
            <span className="text-white">unreported</span> to law enforcement.
          </span>
        </p>
        <p
          className="mt-6 font-mono text-[10px] uppercase tracking-widest text-neutral-500"
          style={fadeUp(620)}
        >
          Source · Bureau of Justice Statistics
        </p>
      </div>
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

function YCBadge() {
  return (
    <a
      href="https://events.ycombinator.com/GStack"
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 border border-[#FF6601] bg-white py-1 pl-1 pr-3 font-mono text-[10px] uppercase tracking-widest text-[#FF6601] transition-colors hover:bg-[#FFF1E8]"
    >
      <Image
        src="/yc-logo.png"
        alt="Y Combinator"
        width={20}
        height={20}
        priority
        className="block"
      />
      <span>Built at YC · GStack × GBrain Hackathon</span>
    </a>
  );
}

type FeedPhase = "idle" | "ingesting" | "fusing" | "fused" | "held";

function SignalFeed() {
  const [filled, setFilled] = useState<(Signal | null)[]>([null, null, null]);
  const [phase, setPhase] = useState<FeedPhase>("idle");
  const counterRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      while (!cancelled) {
        setFilled([null, null, null]);
        setPhase("idle");
        await wait(700);
        if (cancelled) return;
        setPhase("ingesting");
        for (let i = 0; i < SCENARIO.length; i++) {
          if (cancelled) return;
          counterRef.current += 1;
          const ts = fmtTime(new Date());
          const scenarioItem = SCENARIO[i];
          if (!scenarioItem) continue;
          const s: Signal = { ...scenarioItem, id: counterRef.current, ts };
          setFilled((prev) => {
            const next = [...prev];
            next[i] = s;
            return next;
          });
          await wait(900 + Math.random() * 400);
        }
        if (cancelled) return;
        setPhase("fusing");
        await wait(900);
        if (cancelled) return;
        setPhase("fused");
        await wait(2400);
        if (cancelled) return;
        setPhase("held");
        await wait(1800);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const filledCount = filled.filter(Boolean).length;
  const showFused = phase === "fused" || phase === "held";

  return (
    <div className="relative">
      <div className="absolute -inset-1 -z-10 bg-neutral-100/50" aria-hidden />
      <div className="flex h-[420px] flex-col border border-black bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-black"
              style={{ animation: "wd-pulse-dot 1.4s ease-in-out infinite" }}
            />
            Dispatcher queue · live
          </span>
          <span className="tabular-nums">
            signals · {filledCount}/{SCENARIO.length}
          </span>
        </div>

        <div className="flex flex-1 flex-col divide-y divide-neutral-200">
          {filled.map((s, i) => (
            <SignalRow key={i} signal={s} index={i} fusing={phase === "fusing"} />
          ))}
        </div>

        <FusedSlot visible={showFused} held={phase === "held"} />

        <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <Caret /> correlator · 200m · 60s · {phaseLabel(phase)}
        </div>
      </div>
    </div>
  );
}

function phaseLabel(p: FeedPhase) {
  switch (p) {
    case "idle": return "standby";
    case "ingesting": return "ingesting";
    case "fusing": return "correlating…";
    case "fused": return "fused → dispatcher";
    case "held": return "held by dispatcher";
  }
}

function SignalRow({
  signal,
  index,
  fusing,
}: {
  signal: Signal | null;
  index: number;
  fusing: boolean;
}) {
  const PLACEHOLDER_ORDER = ["camera", "call", "shotspotter"] as const satisfies readonly SourceType[];
  const placeholderSrc: SourceType =
    PLACEHOLDER_ORDER[index % PLACEHOLDER_ORDER.length] ?? "camera";
  return (
    <div
      className="flex h-full min-h-0 flex-1 items-center px-3"
      style={{
        background: fusing && signal ? "rgba(0,0,0,0.04)" : undefined,
        transition: "background 320ms ease",
      }}
    >
      {signal ? (
        <div
          className="flex w-full items-baseline justify-between gap-3 font-mono text-[11px]"
          style={{ animation: "wd-slide-in 360ms ease-out both" }}
        >
          <span className="flex items-baseline gap-3 truncate">
            <span className="tabular-nums text-neutral-400">{signal.ts}</span>
            <span className="border border-black px-1 py-0.5 text-[9px] uppercase tracking-widest">
              {SOURCE_GLYPH[signal.source]}
            </span>
            <span className="truncate text-black">{signal.location}</span>
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {signal.detail}
          </span>
        </div>
      ) : (
        <div className="flex w-full items-baseline justify-between gap-3 font-mono text-[11px] text-neutral-300">
          <span className="flex items-baseline gap-3">
            <span className="tabular-nums">--:--:--</span>
            <span className="border border-neutral-200 px-1 py-0.5 text-[9px] uppercase tracking-widest">
              {SOURCE_GLYPH[placeholderSrc]}
            </span>
            <span>awaiting</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest">
            —
          </span>
        </div>
      )}
    </div>
  );
}

function FusedSlot({ visible, held }: { visible: boolean; held: boolean }) {
  return (
    <div
      className={`shrink-0 overflow-hidden border-t ${
        visible ? "border-black bg-black text-white" : "border-neutral-200 bg-white text-neutral-400"
      }`}
      style={{
        height: 84,
        transition: "background 280ms ease, color 280ms ease, border-color 280ms ease",
      }}
    >
      <div
        className="px-3 py-3"
        style={{
          opacity: visible ? 1 : 0.55,
          transition: "opacity 240ms ease",
        }}
      >
        {visible ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-widest">
                <span className="border border-white px-1 py-0.5 text-[9px]">high</span>
                Possible assault · Mission &amp; 16th
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
                {SCENARIO.length} signals
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
              <span>GBrain: 4 dismissals · 30d · bar-closing crowd</span>
              <span className="text-white">
                {held ? "→ dispatcher held" : "→ awaiting decision"}
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-widest">
            ⟶ correlator output · awaiting fusion
          </div>
        )}
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

function HowItWorks() {
  return (
    <>
      <section id="how" className="border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-6">
          <div className="flex items-baseline justify-between gap-6">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              How it works
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
              three steps · 200 m / 60 s window
            </span>
          </div>
          <p className="mt-6 max-w-2xl font-mono text-sm leading-relaxed text-neutral-700">
            Three feeds → one queue → one decision.
          </p>
        </div>
      </section>

      <HowStep
        n="01"
        title="Fusion"
        kicker="Correlate signals across silos"
        caption="Camera, 911, and ShotSpotter signals get matched on a 200 m / 60 s window into one ranked incident."
        bullets={[
          "Spatial-temporal match across CAM · 911 · SHT",
          "Severity = source confidence × signal density",
          "Three dashboards → one queue",
        ]}
        diagram={<FusionDiagram />}
      />

      <HowStep
        n="02"
        title="Memory"
        kicker="Carry context to the next signal"
        mirror
        caption="Every reviewed incident becomes a memory chip on that corner. The next signal there arrives with the history attached."
        bullets={[
          "Per-location store of outcomes + reasons",
          "Recalls patterns: 'same shape 4× last month'",
          "Fewer false dispatches over time",
        ]}
        diagram={<MemoryDiagram />}
      />

      <HowStep
        n="03"
        title="Decision"
        kicker="Approve, reassign, or kill"
        caption="One queue for predicted + live calls. Each card auto-assigns an officer. 30 seconds to act, or it dispatches."
        bullets={[
          "Predicted + live in one queue",
          "30s to act, or it auto-dispatches",
          "Every decision audited",
        ]}
        diagram={<DecisionDiagram />}
      />
    </>
  );
}

function HowStep({
  n,
  title,
  kicker,
  caption,
  bullets,
  diagram,
  mirror,
}: {
  n: string;
  title: string;
  kicker: string;
  caption: string;
  bullets: string[];
  diagram: React.ReactNode;
  mirror?: boolean;
}) {
  const [sectionRef, inView] = useInView<HTMLDivElement>({ threshold: 0.18 });
  return (
    <section className="border-b border-neutral-200">
      <div
        ref={sectionRef}
        className="mx-auto max-w-6xl px-6 py-20 lg:py-24"
        style={{
          opacity: inView ? 1 : 0,
          transform: inView ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 700ms ease-out, transform 700ms ease-out",
        }}
      >
        <div
          className={`grid grid-cols-1 items-center gap-10 lg:gap-16 ${
            mirror ? "lg:grid-cols-[5fr_2fr]" : "lg:grid-cols-[2fr_5fr]"
          }`}
        >
          <div className={mirror ? "lg:order-2" : ""}>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-5xl leading-none tracking-tight text-neutral-200 tabular-nums">
                {n}
              </span>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  {kicker}
                </span>
                <h3 className="font-mono text-2xl tracking-tight md:text-3xl">
                  {title}
                </h3>
              </div>
            </div>
            <p className="mt-6 max-w-md font-mono text-sm leading-relaxed text-neutral-700">
              {caption}
            </p>
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-widest text-neutral-700"
                >
                  <span className="text-neutral-400">▸</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={mirror ? "lg:order-1" : ""}>
            <div className="wd-diagram-shell border border-neutral-200 bg-white p-3 md:p-4">
              {diagram}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const DIAGRAM_STROKE = "#000";
const DIAGRAM_MUTED = "#9ca3af";
const DIAGRAM_ACCENT = "#FF6601";
const PX_MONO = "ui-monospace, 'SF Mono', monospace";

function ArrowDef({ id, color = DIAGRAM_STROKE }: { id: string; color?: string }) {
  return (
    <defs>
      <marker
        id={id}
        viewBox="0 0 8 8"
        refX="7"
        refY="4"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L8,4 L0,8 z" fill={color} />
      </marker>
    </defs>
  );
}

function ZoneFrame({
  x,
  y,
  w,
  h,
  step,
  label,
  openLeft,
  openRight,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  step: string;
  label: string;
  openLeft?: boolean;
  openRight?: boolean;
}) {
  const dash = "2 3";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="white" stroke="transparent" />
      {/* top */}
      <line x1={x} y1={y} x2={x + w} y2={y} stroke={DIAGRAM_MUTED} strokeDasharray={dash} />
      {/* bottom */}
      <line x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={DIAGRAM_MUTED} strokeDasharray={dash} />
      {!openLeft && (
        <line x1={x} y1={y} x2={x} y2={y + h} stroke={DIAGRAM_MUTED} strokeDasharray={dash} />
      )}
      {!openRight && (
        <line
          x1={x + w}
          y1={y}
          x2={x + w}
          y2={y + h}
          stroke={DIAGRAM_MUTED}
          strokeDasharray={dash}
        />
      )}
      <text
        x={x + 8}
        y={y + 14}
        fontFamily={PX_MONO}
        fontSize="8"
        fill={DIAGRAM_MUTED}
        letterSpacing="1.2"
      >
        {step.toUpperCase()} · {label.toUpperCase()}
      </text>
    </g>
  );
}

function FusionDiagram() {
  const sources: { glyph: string; label: string; ts: string; meta: string }[] = [
    { glyph: "CAM", label: "Streetlight 14B", ts: "22:50:01", meta: "pose: fighting · 0.87" },
    { glyph: "911", label: "Hangup", ts: "22:50:08", meta: "no callback" },
    { glyph: "SHT", label: "ShotSpotter", ts: "22:50:18", meta: "1 report" },
  ];
  const rowH = 56;
  const baseY = 60;
  const [svgRef, inView] = useInView<SVGSVGElement>({ threshold: 0.35 });
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 480 280"
      className="w-full"
      role="img"
      aria-label="Fusion diagram"
    >
      <ArrowDef id="arr-fusion" />
      <ZoneFrame x={4} y={4} w={180} h={272} step="01" label="signals" openRight />
      <ZoneFrame x={196} y={4} w={132} h={272} step="02" label="correlator" openLeft openRight />
      <ZoneFrame x={340} y={4} w={136} h={272} step="03" label="incident" openLeft />

      {sources.map((s, i) => {
        const y = baseY + i * rowH;
        const initial = { opacity: 0, transform: "translateX(-8px)" };
        const live = {
          opacity: 1,
          transform: "translateX(0)",
          transition: `opacity 520ms ease-out ${i * 220}ms, transform 520ms ease-out ${i * 220}ms`,
        };
        return (
          <g
            key={s.glyph}
            className="wd-fusion-source"
            style={{ cursor: "pointer", ...(inView ? live : initial) }}
          >
            <rect
              className="wd-fusion-source-bg"
              x={12}
              y={y - 4}
              width={168}
              height={44}
              rx={2}
              fill="white"
              stroke="transparent"
            />
            <text x={20} y={y + 8} fontFamily={PX_MONO} fontSize="8" fill={DIAGRAM_MUTED}>
              {s.ts}
            </text>
            <rect
              className="wd-fusion-source-chip"
              x={20}
              y={y + 12}
              width={32}
              height={16}
              fill="white"
              stroke={DIAGRAM_STROKE}
            />
            <text
              x={36}
              y={y + 23}
              textAnchor="middle"
              fontFamily={PX_MONO}
              fontSize="9"
              fontWeight="600"
              fill={DIAGRAM_STROKE}
            >
              {s.glyph}
            </text>
            <text x={58} y={y + 23} fontFamily={PX_MONO} fontSize="10" fill={DIAGRAM_STROKE}>
              {s.label}
            </text>
            <text x={58} y={y + 35} fontFamily={PX_MONO} fontSize="8" fill={DIAGRAM_MUTED}>
              {s.meta}
            </text>
            <path
              className="wd-fusion-source-arrow"
              d={`M180,${y + 20} C 198,${y + 20} 206,140 232,140`}
              fill="none"
              stroke={DIAGRAM_STROKE}
              strokeWidth="1"
              markerEnd="url(#arr-fusion)"
            />
          </g>
        );
      })}

      <rect x={216} y={108} width={92} height={64} fill="white" stroke={DIAGRAM_STROKE} />
      <text x={262} y={128} textAnchor="middle" fontFamily={PX_MONO} fontSize="10" fill={DIAGRAM_STROKE}>
        CORRELATE
      </text>
      <text x={262} y={144} textAnchor="middle" fontFamily={PX_MONO} fontSize="8" fill={DIAGRAM_MUTED}>
        200 m · 60 s
      </text>
      <text x={262} y={160} textAnchor="middle" fontFamily={PX_MONO} fontSize="8" fill={DIAGRAM_MUTED}>
        cosine + space-time
      </text>

      <path
        d="M308,140 L356,140"
        stroke={DIAGRAM_STROKE}
        strokeWidth="1"
        markerEnd="url(#arr-fusion)"
      />

      <rect x={356} y={92} width={104} height={96} fill={DIAGRAM_STROKE} />
      <text x={368} y={108} fontFamily={PX_MONO} fontSize="7" fill="#a3a3a3" letterSpacing="1.2">
        INCIDENT · #1242
      </text>
      <text x={368} y={130} fontFamily={PX_MONO} fontSize="10" fill="white">
        Possible
      </text>
      <text x={368} y={144} fontFamily={PX_MONO} fontSize="10" fill="white">
        assault
      </text>
      <text x={368} y={166} fontFamily={PX_MONO} fontSize="8" fill="#a3a3a3">
        Mission &amp; 16th
      </text>
      <rect x={368} y={172} width={28} height={10} fill="none" stroke="white" />
      <text x={382} y={180} textAnchor="middle" fontFamily={PX_MONO} fontSize="7" fill="white">
        MED
      </text>
      <text x={400} y={180} fontFamily={PX_MONO} fontSize="7" fill="#a3a3a3">
        3 signals
      </text>
    </svg>
  );
}

function MemoryDiagram() {
  const chips = [
    { ts: "−3 d", note: "4× dismissed · bar crowd" },
    { ts: "−7 d", note: "11 PM cluster · Valencia" },
    { ts: "−12 d", note: "false pose 0.71 · CAM 14B" },
    { ts: "−21 d", note: "confirmed · charged" },
    { ts: "−34 d", note: "311 noise · same corner" },
  ];
  // Re-trigger the chip reveal when the diagram scrolls into view so the
  // animation lands when the operator is actually looking at it.
  const [svgRef, inView] = useInView<SVGSVGElement>({ threshold: 0.35 });
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 520 340"
      className="w-full"
      role="img"
      aria-label="Memory diagram"
    >
      <ArrowDef id="arr-memory" />
      <ZoneFrame x={4} y={4} w={156} h={332} step="01" label="review" openRight />
      <ZoneFrame x={172} y={4} w={192} h={332} step="02" label="gbrain" openLeft openRight />
      <ZoneFrame x={376} y={4} w={140} h={332} step="03" label="recall" openLeft />

      {/* Review zone — bigger incident card. */}
      <rect x={20} y={56} width={124} height={240} fill="white" stroke={DIAGRAM_STROKE} />
      <text x={28} y={72} fontFamily={PX_MONO} fontSize="8" fill={DIAGRAM_MUTED} letterSpacing="1.2">
        INCIDENT · #1241
      </text>
      <text x={28} y={96} fontFamily={PX_MONO} fontSize="12" fill={DIAGRAM_STROKE}>
        dispatcher
      </text>
      <text x={28} y={114} fontFamily={PX_MONO} fontSize="12" fill={DIAGRAM_STROKE}>
        held
      </text>
      <line x1={28} y1={128} x2={136} y2={128} stroke={DIAGRAM_MUTED} strokeDasharray="2 2" />
      <text x={28} y={146} fontFamily={PX_MONO} fontSize="9" fill={DIAGRAM_MUTED}>
        reason
      </text>
      <text x={28} y={160} fontFamily={PX_MONO} fontSize="10" fill={DIAGRAM_STROKE}>
        bar crowd
      </text>
      <text x={28} y={184} fontFamily={PX_MONO} fontSize="9" fill={DIAGRAM_MUTED}>
        outcome
      </text>
      <text x={28} y={198} fontFamily={PX_MONO} fontSize="10" fill={DIAGRAM_STROKE}>
        no patrol sent
      </text>
      <text x={28} y={222} fontFamily={PX_MONO} fontSize="9" fill={DIAGRAM_MUTED}>
        reviewer
      </text>
      <text x={28} y={236} fontFamily={PX_MONO} fontSize="10" fill={DIAGRAM_STROKE}>
        Off. Reyes
      </text>
      <text x={28} y={272} fontFamily={PX_MONO} fontSize="8" fill={DIAGRAM_MUTED} letterSpacing="1.2">
        22:50 · 2026-05-15
      </text>

      <path d="M146,160 L174,160" stroke={DIAGRAM_STROKE} markerEnd="url(#arr-memory)" />
      <text x={160} y={154} textAnchor="middle" fontFamily={PX_MONO} fontSize="7" fill={DIAGRAM_MUTED}>
        write
      </text>

      {/* GBrain zone — taller box, 5 chips. */}
      <rect x={184} y={36} width={168} height={288} fill="white" stroke={DIAGRAM_STROKE} />
      <text x={192} y={54} fontFamily={PX_MONO} fontSize="9" fill={DIAGRAM_MUTED} letterSpacing="1.2">
        GBRAIN · mission/16th
      </text>
      <line x1={184} y1={62} x2={352} y2={62} stroke={DIAGRAM_MUTED} strokeDasharray="2 2" />
      {chips.map((c, i) => {
        const y = 76 + i * 46;
        const isNew = i === 0;
        const initialState = { opacity: 0, transform: "translateY(6px)" };
        const liveState = {
          opacity: 1,
          transform: "translateY(0)",
          transition: `opacity 480ms ease-out ${i * 180}ms, transform 480ms ease-out ${i * 180}ms`,
        };
        return (
          <g
            key={c.ts}
            className="wd-memory-chip"
            style={{ cursor: "pointer", ...(inView ? liveState : initialState) }}
          >
            <rect
              className="wd-memory-chip-bg"
              x={192}
              y={y}
              width={152}
              height={36}
              fill={isNew ? DIAGRAM_STROKE : "white"}
              stroke={DIAGRAM_STROKE}
            />
            <text
              x={200}
              y={y + 13}
              fontFamily={PX_MONO}
              fontSize="8"
              fill={isNew ? "#a3a3a3" : DIAGRAM_MUTED}
              letterSpacing="1.2"
            >
              {c.ts}
            </text>
            <text
              x={200}
              y={y + 27}
              fontFamily={PX_MONO}
              fontSize="8"
              fill={isNew ? "white" : DIAGRAM_STROKE}
            >
              {c.note}
            </text>
          </g>
        );
      })}

      <path d="M352,170 L378,170" stroke={DIAGRAM_STROKE} markerEnd="url(#arr-memory)" />
      <text x={365} y={164} textAnchor="middle" fontFamily={PX_MONO} fontSize="7" fill={DIAGRAM_MUTED}>
        recall
      </text>

      {/* Recall zone — bigger next-signal card. */}
      <rect x={394} y={64} width={114} height={224} fill="white" stroke={DIAGRAM_STROKE} />
      <text x={402} y={82} fontFamily={PX_MONO} fontSize="8" fill={DIAGRAM_MUTED} letterSpacing="1.2">
        NEXT SIGNAL
      </text>
      <text x={402} y={108} fontFamily={PX_MONO} fontSize="13" fill={DIAGRAM_STROKE}>
        CAM 14B
      </text>
      <text x={402} y={124} fontFamily={PX_MONO} fontSize="9" fill={DIAGRAM_MUTED}>
        Mission &amp; 16th
      </text>
      <line x1={402} y1={140} x2={500} y2={140} stroke={DIAGRAM_MUTED} strokeDasharray="2 2" />
      <rect x={402} y={154} width={100} height={20} fill={DIAGRAM_STROKE} />
      <text x={410} y={167} fontFamily={PX_MONO} fontSize="9" fill="white">
        + 5 prior matches
      </text>
      <text x={402} y={194} fontFamily={PX_MONO} fontSize="9" fill={DIAGRAM_MUTED}>
        score
      </text>
      <text x={402} y={210} fontFamily={PX_MONO} fontSize="11" fill={DIAGRAM_STROKE}>
        ↓ false-positive
      </text>
      <text x={402} y={234} fontFamily={PX_MONO} fontSize="9" fill={DIAGRAM_MUTED}>
        pattern
      </text>
      <text x={402} y={250} fontFamily={PX_MONO} fontSize="10" fill={DIAGRAM_STROKE}>
        bar closing
      </text>
      <text x={402} y={274} fontFamily={PX_MONO} fontSize="8" fill={DIAGRAM_MUTED} letterSpacing="1.2">
        → soft-rank
      </text>
    </svg>
  );
}


type DecisionState = "pending" | "approved" | "reassigned" | "rejected";

function DecisionDiagram() {
  const [predicted, setPredicted] = useState<DecisionState>("pending");
  const [live, setLive] = useState<DecisionState>("pending");
  // `auto` tracks whether the most recent state change came from the
  // countdown auto-firing (true) vs a user click (false). Used to decide
  // whether to loop the demo or hold the state.
  const [predictedAuto, setPredictedAuto] = useState(false);
  const [liveAuto, setLiveAuto] = useState(false);
  const [wrapRef, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });

  // Loop the demo: 4s after an auto-fire, snap back to pending so the
  // countdown restarts. User clicks don't loop — they hold until reset.
  useEffect(() => {
    if (predicted !== "approved" || !predictedAuto) return;
    const id = setTimeout(() => {
      setPredicted("pending");
      setPredictedAuto(false);
    }, 4000);
    return () => clearTimeout(id);
  }, [predicted, predictedAuto]);
  useEffect(() => {
    if (live !== "approved" || !liveAuto) return;
    const id = setTimeout(() => {
      setLive("pending");
      setLiveAuto(false);
    }, 4000);
    return () => clearTimeout(id);
  }, [live, liveAuto]);
  const cardStyle = (i: number) =>
    inView
      ? {
          opacity: 1,
          transform: "translateY(0)",
          transition: `opacity 520ms ease-out ${i * 220}ms, transform 520ms ease-out ${i * 220}ms`,
        }
      : { opacity: 0, transform: "translateY(12px)" };
  return (
    <div
      ref={wrapRef}
      className="flex flex-col gap-3"
      role="group"
      aria-label="Decision diagram"
    >
      <div style={cardStyle(0)}>
        <DecisionCard
          kind="predicted"
          priority="A"
          title="245 ADW · Mission corridor"
          sub="GBrain: A + B in same neighborhood, 4 calls in 7m · conf 0.78"
          officer="Off. Reyes 4B21 · Co. B"
          countdown={30}
          state={predicted}
          countdownAnimated={inView}
          onApprove={(auto) => {
            setPredicted("approved");
            setPredictedAuto(auto);
          }}
          onReassign={() => {
            setPredicted("reassigned");
            setPredictedAuto(false);
          }}
          onReject={() => {
            setPredicted("rejected");
            setPredictedAuto(false);
          }}
          onReset={() => {
            setPredicted("pending");
            setPredictedAuto(false);
          }}
        />
      </div>
      <div style={cardStyle(1)}>
        <DecisionCard
          kind="live"
          priority="B"
          title="594 Vandalism · Eddy & Leavenworth"
          sub="SFPD Co. D (Tenderloin) · TG 816 · call #261342053"
          officer="Off. Patel 4D05 · Co. D"
          countdown={20}
          state={live}
          countdownAnimated={inView}
          onApprove={(auto) => {
            setLive("approved");
            setLiveAuto(auto);
          }}
          onReassign={() => {
            setLive("reassigned");
            setLiveAuto(false);
          }}
          onReject={() => {
            setLive("rejected");
            setLiveAuto(false);
          }}
          onReset={() => {
            setLive("pending");
            setLiveAuto(false);
          }}
        />
      </div>
      <p
        className="font-mono text-[9px] uppercase tracking-widest text-neutral-400"
        style={cardStyle(2)}
      >
        Click any button to preview · click the status badge to reset
      </p>
    </div>
  );
}

function DecisionCard({
  kind,
  priority,
  title,
  sub,
  officer,
  countdown,
  state,
  countdownAnimated,
  onApprove,
  onReassign,
  onReject,
  onReset,
}: {
  kind: "predicted" | "live";
  priority: string;
  title: string;
  sub: string;
  officer: string;
  countdown: number;
  state: DecisionState;
  countdownAnimated?: boolean;
  onApprove: (auto: boolean) => void;
  onReassign: () => void;
  onReject: () => void;
  onReset: () => void;
}) {
  const isPredicted = kind === "predicted";
  const isDone = state !== "pending";
  const initialCountdown = countdown;

  // Live countdown — starts decrementing once the section enters view
  // (countdownAnimated flips true), stops if the card is reset or the
  // operator actuates it. At zero, auto-approve fires (the simulated
  // dispatcher hand-off).
  const [remaining, setRemaining] = useState(initialCountdown);
  useEffect(() => {
    if (state !== "pending") return;
    setRemaining(initialCountdown);
  }, [state, initialCountdown]);
  useEffect(() => {
    if (state !== "pending" || !countdownAnimated) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          // Defer the parent setState by a tick so we don't update a
          // parent state from inside our own state updater. Pass auto=true
          // so the parent knows this was a countdown fire vs a button click.
          setTimeout(() => onApprove(true), 0);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state, countdownAnimated, onApprove]);

  const pctLeft = Math.max(0, Math.min(1, remaining / initialCountdown));
  return (
    <article
      className={[
        "group relative overflow-hidden border bg-white transition-all duration-200",
        isPredicted
          ? "border-l-[3px] border-l-black border-y-neutral-200 border-r-neutral-200"
          : "border-neutral-300",
        state === "approved" && "bg-black text-white",
        state === "rejected" && "bg-neutral-50 opacity-70",
        state === "reassigned" && "bg-neutral-50",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span
            className={
              isPredicted
                ? "border border-black bg-black px-1 py-px font-mono text-[8px] uppercase tracking-widest text-white"
                : "border border-neutral-500 bg-white px-1 py-px font-mono text-[8px] uppercase tracking-widest text-neutral-600"
            }
          >
            {isPredicted ? "PRED" : "LIVE"}
          </span>
          <span className="border border-black bg-white px-1 py-px font-mono text-[8px] font-bold uppercase tracking-widest text-black">
            P{priority}
          </span>
          <span className="truncate font-mono text-[11px] uppercase tracking-widest">
            {title}
          </span>
        </div>
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset decision"
          className={[
            "shrink-0 border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest transition-colors",
            state === "approved"
              ? "border-white text-white hover:bg-white hover:text-black"
              : state === "rejected"
                ? "border-neutral-400 text-neutral-500 hover:border-black hover:text-black"
                : state === "reassigned"
                  ? "border-neutral-500 text-neutral-700 hover:border-black hover:text-black"
                  : "border-neutral-200 text-neutral-400 hover:border-black hover:text-black",
          ].join(" ")}
        >
          {state === "approved" && "Approved ✓"}
          {state === "rejected" && "Rejected ✗"}
          {state === "reassigned" && "Reassigned ↺"}
          {state === "pending" && "Pending"}
        </button>
      </header>
      <div className="px-3 py-2">
        <p className={`font-mono text-[10px] leading-snug ${state === "approved" ? "text-white/80" : "text-neutral-500"}`}>
          {sub}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`truncate font-mono text-[10px] ${state === "approved" ? "text-white" : "text-black"}`}>
            {officer}
          </span>
          {!isDone && (
            <span className="shrink-0 font-mono tabular-nums text-[9px] uppercase tracking-widest text-neutral-500">
              Auto in {remaining}s
            </span>
          )}
        </div>
        {!isDone && (
          <div className="mt-1.5 h-[2px] w-full bg-neutral-100">
            <div
              className="h-full bg-black"
              style={{
                width: `${pctLeft * 100}%`,
                transition: "width 900ms linear",
              }}
            />
          </div>
        )}
      </div>
      {!isDone && (
        <div className="flex items-center border-t border-neutral-100">
          <button
            type="button"
            onClick={onReject}
            className="flex-1 border-r border-neutral-100 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500 transition-all duration-150 hover:bg-neutral-50 hover:text-black hover:tracking-[0.2em]"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onReassign}
            className="flex-1 border-r border-neutral-100 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500 transition-all duration-150 hover:bg-neutral-50 hover:text-black hover:tracking-[0.2em]"
          >
            Reassign
          </button>
          <button
            type="button"
            onClick={() => onApprove(false)}
            className="flex-1 bg-black py-1.5 font-mono text-[10px] uppercase tracking-widest text-white transition-all duration-150 hover:bg-neutral-800 hover:tracking-[0.22em]"
          >
            Approve
          </button>
        </div>
      )}
      {isDone && (
        <div
          className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest ${
            state === "approved"
              ? "bg-black text-white"
              : state === "rejected"
                ? "bg-neutral-100 text-neutral-500"
                : "bg-neutral-100 text-neutral-700"
          }`}
        >
          {state === "approved" && `Dispatched · ${officer.split(" · ")[0]}`}
          {state === "rejected" && "Cancelled · written to memory"}
          {state === "reassigned" && "Reassignment in flight · countdown reset"}
        </div>
      )}
    </article>
  );
}

function Pillars() {
  return (
    <section className="border-b border-neutral-200 bg-neutral-50/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Principles
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
        <span>WatchDog · GStack × GBrain · 2026</span>
        <span>Live SF data · No persistent video retention</span>
      </div>
    </footer>
  );
}

function wait(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
