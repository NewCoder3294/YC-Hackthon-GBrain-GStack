"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// IntersectionObserver: returns [ref, inView]. Latches to true so reveal
// animations play exactly once when the section scrolls into view.
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

export function BusinessOwnerView() {
  return (
    <>
      <OwnerHero />
      <OwnerHookStat />
      <OwnerComparison />
      <OwnerBenefits />
      <OwnerProcess />
      <OwnerAuditDashboard />
      <OwnerFAQ />
      <OwnerWaitlist />
    </>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function OwnerHero() {
  return (
    <section className="relative border-b border-neutral-200">
      <div className="wd-grid pointer-events-none absolute inset-0" aria-hidden />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-black/40"
        style={{ animation: "wd-scan 7s linear infinite" }}
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-28 lg:pt-24">
        <div>
          <OwnerYCBadge />
          <p className="mt-5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            San Francisco · For shop &amp; business owners
          </p>
          <h1 className="mt-6 font-mono text-3xl leading-[1.1] tracking-tight md:text-5xl">
            <span
              style={{
                display: "inline-block",
                opacity: 0,
                animation: "wd-fade-up 700ms ease-out forwards",
              }}
            >
              Your CCTV does
            </span>
            <br />
            <span
              className="text-neutral-400"
              style={{
                display: "inline-block",
                opacity: 0,
                animation: "wd-fade-up 700ms ease-out 200ms forwards",
              }}
            >
              nothing at 2 AM.
            </span>
            <br />
            <span
              style={{
                display: "inline-block",
                opacity: 0,
                animation: "wd-fade-up 700ms ease-out 1100ms forwards",
              }}
            >
              Let it actually protect your shop.
            </span>
          </h1>
          <p className="mt-8 max-w-xl font-mono text-sm leading-relaxed text-neutral-700">
            Most storefront cameras record to a hard drive nobody reviews
            until something goes wrong. Hook your feed into WatchDog and a
            real-time crime center watches it 24/7 — alerts on break-ins,
            vandalism, and suspicious activity at your block, with{" "}
            <span className="text-black">full audit and consent</span> over
            every police query.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href="#waitlist"
              className="border border-black bg-black px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
            >
              Join the waitlist →
            </a>
            <a
              href="#how-to-join"
              className="border border-neutral-300 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-black transition-colors hover:border-black"
            >
              How it works
            </a>
          </div>
          <OwnerStatStrip />
        </div>
        <OwnerNeighborhoodMock />
      </div>
    </section>
  );
}

function OwnerYCBadge() {
  return (
    <a
      href="https://events.ycombinator.com/GStack"
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 border border-black bg-white py-1 pl-1 pr-3 font-mono text-[10px] uppercase tracking-widest text-black transition-colors hover:bg-neutral-100"
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

function OwnerStatStrip() {
  return (
    <div className="mt-12 grid grid-cols-3 gap-px border border-neutral-200 bg-neutral-200">
      <MiniStat label="Always on" value="24/7" />
      <MiniStat label="Setup" value="< 10 min" />
      <MiniStat label="Cost to you" value="$0" />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <div className="font-mono text-xl tracking-tight tabular-nums md:text-2xl">
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
    </div>
  );
}

// Neighborhood mock — your storefront sits in the middle, signals from
// nearby PD/FIRE/311 calls fly in toward it. Matches the dispatcher
// landing's FusionDiagram style so the two audiences see a consistent
// visual idiom.
function OwnerNeighborhoodMock() {
  const [phase, setPhase] = useState<
    "idle" | "signal-1" | "signal-2" | "alerted" | "dispatched"
  >("idle");
  useEffect(() => {
    let cancelled = false;
    async function loop() {
      while (!cancelled) {
        setPhase("idle");
        await wait(1600);
        if (cancelled) return;
        setPhase("signal-1");
        await wait(1100);
        if (cancelled) return;
        setPhase("signal-2");
        await wait(1100);
        if (cancelled) return;
        setPhase("alerted");
        await wait(2600);
        if (cancelled) return;
        setPhase("dispatched");
        await wait(2800);
      }
    }
    loop();
    return () => {
      cancelled = true;
    };
  }, []);

  const alerted = phase === "alerted" || phase === "dispatched";
  const dispatched = phase === "dispatched";

  return (
    // self-start prevents the grid row from stretching this column to
    // match the (taller) headline column on the left — without it the
    // -inset-1 backdrop fills the whole row and looks like a shadow.
    <div className="relative lg:self-start">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-1 -z-10 bg-neutral-100/50"
      />
      <div className="flex h-[420px] flex-col border border-black bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-black"
              style={{ animation: "wd-pulse-dot 1.4s ease-in-out infinite" }}
            />
            Your block · Mission &amp; 16th
          </span>
          <span className="tabular-nums">3 cameras · live</span>
        </div>

        <div className="relative flex-1 bg-neutral-50">
          <svg
            viewBox="0 0 480 240"
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Neighborhood signal mock"
          >
            <defs>
              <marker
                id="arr-owner"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="#000" />
              </marker>
              <pattern
                id="block-grid"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="#e5e5e5"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>

            <rect width="480" height="240" fill="url(#block-grid)" />

            {/* Street grid (Mission + 16th) */}
            <line x1="0" y1="120" x2="480" y2="120" stroke="#d4d4d4" strokeWidth="6" />
            <line x1="240" y1="0" x2="240" y2="240" stroke="#d4d4d4" strokeWidth="6" />
            <text
              x="8"
              y="114"
              fontFamily="ui-monospace, monospace"
              fontSize="7"
              fill="#a3a3a3"
              letterSpacing="1.2"
            >
              MISSION ST
            </text>
            <text
              x="246"
              y="12"
              fontFamily="ui-monospace, monospace"
              fontSize="7"
              fill="#a3a3a3"
              letterSpacing="1.2"
            >
              16TH ST
            </text>

            {/* Neighbor shops — one per quadrant, well clear of the
                YOUR STORE box and signal chip endpoints. */}
            <NeighborShop x={60} y={48} label="bakery" />
            <NeighborShop x={420} y={48} label="bar" />
            <NeighborShop x={60} y={196} label="laundry" />
            <NeighborShop x={420} y={196} label="pharmacy" />

            {/* Scanning radius — radar ring around YOUR STORE. Pulses
                continuously to signal "watching", flashes harder when
                alerted to signal "detected". */}
            <circle
              cx={240}
              cy={120}
              r={alerted ? 56 : 44}
              fill="none"
              stroke="#000"
              strokeWidth={alerted ? 1.25 : 0.5}
              strokeDasharray="3 3"
              opacity={alerted ? 0.8 : 0.25}
              style={{
                transition:
                  "r 520ms cubic-bezier(0.16,1,0.3,1), opacity 320ms ease, stroke-width 320ms ease",
                animation: "wd-pulse-dot 1.6s ease-in-out infinite",
                transformOrigin: "240px 120px",
              }}
            />
            {alerted && (
              <circle
                cx={240}
                cy={120}
                r={72}
                fill="none"
                stroke="#000"
                strokeWidth={0.5}
                opacity={0.35}
                style={{
                  animation: "wd-pulse-dot 1.6s ease-in-out infinite 200ms",
                }}
              />
            )}

            {/* Signal A (PD call) — flies in from top-left. Lands
                ABOVE Mission St so it never overlaps the road (where
                the officer car drives during dispatched state). */}
            <SignalChip
              fromX={24}
              fromY={32}
              toX={160}
              toY={76}
              label="PD"
              meta="245 ADW"
              show={phase !== "idle"}
              delay={0}
            />
            {/* Signal B (FIRE) — flies in from bottom-right, lands
                BELOW Mission St in the BR quadrant. Clear of pharmacy
                at (420,196) and the road. */}
            <SignalChip
              fromX={456}
              fromY={210}
              toX={320}
              toY={168}
              label="FIRE"
              meta="EMS"
              show={
                phase === "signal-2" ||
                phase === "alerted" ||
                phase === "dispatched"
              }
              delay={120}
            />

            {/* YOUR STORE marker (centered on the corner) */}
            <g>
              <rect
                x={216}
                y={96}
                width={48}
                height={48}
                fill={alerted ? "#000" : "#fff"}
                stroke="#000"
                strokeWidth="1.5"
                style={{ transition: "fill 320ms ease" }}
              />
              <text
                x={240}
                y={114}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                fontSize="7"
                fill={alerted ? "#737373" : "#a3a3a3"}
                letterSpacing="1.2"
                style={{ transition: "fill 320ms ease" }}
              >
                YOUR
              </text>
              <text
                x={240}
                y={126}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                fontSize="9"
                fontWeight="600"
                fill={alerted ? "#fff" : "#000"}
                style={{ transition: "fill 320ms ease" }}
              >
                STORE
              </text>
              <text
                x={240}
                y={138}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                fontSize="6"
                fill={alerted ? "#737373" : "#a3a3a3"}
                letterSpacing="1.2"
                style={{ transition: "fill 320ms ease" }}
              >
                CAM 14B
              </text>
              {/* Top-right "live" indicator dot — solid when alerted */}
              <circle
                cx={262}
                cy={100}
                r={3}
                fill={alerted ? "#fff" : "#000"}
                stroke="#000"
                strokeWidth="1"
                style={{
                  transition: "fill 320ms ease",
                  animation: "wd-pulse-dot 1.4s ease-in-out infinite",
                }}
              />
            </g>

            {/* Officer car — slides in from off-screen left along
                Mission St when dispatched. Travels along the y=120
                centerline so it reads as "approaching on the road". */}
            <g
              style={{
                opacity: dispatched ? 1 : 0,
                transform: dispatched
                  ? "translateX(0)"
                  : "translateX(-180px)",
                transition: "opacity 360ms ease, transform 920ms cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <rect
                x={150}
                y={114}
                width={22}
                height={12}
                fill="#000"
                stroke="#000"
              />
              <rect
                x={154}
                y={116}
                width={6}
                height={4}
                fill="#fff"
              />
              <text
                x={161}
                y={123}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                fontSize="6"
                fill="#fff"
                fontWeight="600"
              >
                4D
              </text>
              <text
                x={148}
                y={142}
                fontFamily="ui-monospace, monospace"
                fontSize="6"
                fill="#000"
                letterSpacing="1.2"
              >
                SFPD CO. D
              </text>
            </g>
          </svg>
        </div>

        <div
          className="shrink-0 overflow-hidden border-t"
          style={{
            background: alerted ? "#000" : "#fff",
            borderColor: alerted ? "#000" : "#e5e5e5",
            color: alerted ? "#fff" : "#a3a3a3",
            transition:
              "background 280ms ease, color 280ms ease, border-color 280ms ease",
            minHeight: 80,
          }}
        >
          <div className="px-3 py-3">
            {alerted ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-widest">
                    <span className="border border-white px-1 py-0.5 text-[9px]">
                      alert
                    </span>
                    Activity on your block · 2:14 AM
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
                    sms · pushed
                  </span>
                </div>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
                  {dispatched
                    ? "→ SFPD Co. D dispatched · ETA 3 min · clip saved"
                    : "Two signals correlated near your storefront"}
                </p>
              </>
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-widest">
                ⟶ watching · no alerts
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          consent · policy enforced · audit logged
        </div>
      </div>
    </div>
  );
}

function NeighborShop({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <g>
      <rect
        x={x - 14}
        y={y - 14}
        width={28}
        height={28}
        fill="#fff"
        stroke="#d4d4d4"
      />
      <text
        x={x}
        y={y + 2}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize="6"
        fill="#a3a3a3"
        letterSpacing="0.5"
      >
        {label}
      </text>
    </g>
  );
}

function SignalChip({
  fromX,
  fromY,
  toX,
  toY,
  label,
  meta,
  show,
  delay,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label: string;
  meta: string;
  show: boolean;
  delay: number;
}) {
  return (
    <g
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "translate(0,0)" : `translate(${fromX - toX}px, ${fromY - toY}px)`,
        transition: `opacity 540ms ease ${delay}ms, transform 720ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      <path
        d={`M${fromX},${fromY} Q${(fromX + toX) / 2},${(fromY + toY) / 2 - 20} ${toX},${toY}`}
        fill="none"
        stroke="#000"
        strokeWidth="1"
        strokeDasharray="2 3"
        opacity={show ? 0.4 : 0}
        style={{ transition: `opacity 380ms ease ${delay + 100}ms` }}
      />
      <rect
        x={toX - 22}
        y={toY - 8}
        width={44}
        height={16}
        fill="#fff"
        stroke="#000"
      />
      <text
        x={toX}
        y={toY + 3}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize="7"
        fontWeight="600"
        fill="#000"
        letterSpacing="1"
      >
        {label} · {meta}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Hook stat — emotional anchor stat. Parallels the dispatcher landing's
// 62% slab so the two audiences share visual rhythm.
// ---------------------------------------------------------------------------

function OwnerHookStat() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });

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
    <section className="overflow-hidden border-b border-neutral-200 bg-black text-white">
      <div
        ref={ref}
        className="mx-auto max-w-4xl px-6 py-20 text-center md:py-28"
      >
        <p
          className="font-mono text-xs uppercase tracking-[0.25em] text-neutral-400 md:text-sm"
          style={fadeUp(0)}
        >
          Why this matters for you
        </p>
        <p className="mt-6 font-mono text-3xl leading-[1.15] tracking-tight md:text-5xl">
          <span
            className="block tabular-nums text-white md:text-[7rem] md:leading-none"
            style={{ fontVariantNumeric: "tabular-nums", ...slideInBig }}
          >
            13.9%
          </span>
          <span
            className="mt-4 block text-neutral-300 md:text-4xl"
            style={fadeUp(420)}
          >
            of U.S. burglaries are{" "}
            <span className="text-white">cleared by arrest.</span>
          </span>
        </p>
        <p
          className="mt-6 font-mono text-[10px] uppercase tracking-widest text-neutral-500"
          style={fadeUp(620)}
        >
          Source · FBI Uniform Crime Report · Property Crime
        </p>
        <p
          className="mx-auto mt-6 max-w-xl font-mono text-sm leading-relaxed text-neutral-300"
          style={fadeUp(720)}
        >
          When the camera footage is reviewed hours later, the suspect is
          long gone and the trail is cold. WatchDog moves that review to{" "}
          <span className="text-white">the moment it happens.</span>
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Before / After comparison
// ---------------------------------------------------------------------------

function OwnerComparison() {
  const before = [
    { ts: "02:14", label: "Front door rattles.", muted: true },
    { ts: "02:15", label: "Window pried open.", muted: true },
    { ts: "02:16", label: "Cash register hit.", muted: true },
    { ts: "02:18", label: "Suspect gone. Camera kept recording.", muted: true },
    { ts: "07:30", label: "You arrive. Discover damage.", muted: true },
    { ts: "08:45", label: "You file a report. No leads.", muted: true },
  ];
  const after = [
    { ts: "02:14", label: "WatchDog flags loiter > 60s.", bold: true },
    { ts: "02:15", label: "SMS sent to you · clip frozen.", bold: true },
    { ts: "02:15", label: "Dispatcher reviews · approves.", bold: false },
    { ts: "02:18", label: "Co. D officer on scene.", bold: false },
    { ts: "02:24", label: "Suspect detained · clip in evidence.", bold: false },
    { ts: "08:00", label: "You arrive. Police report waiting.", bold: false },
  ];
  return (
    <section className="border-b border-neutral-200">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex items-baseline justify-between gap-6">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Same break-in · two timelines
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            6 hours · one decision
          </span>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-px border border-neutral-200 bg-neutral-200 md:grid-cols-2">
          <TimelineColumn
            kind="before"
            heading="Today"
            kicker="No connected eyes"
            rows={before}
          />
          <TimelineColumn
            kind="after"
            heading="With WatchDog"
            kicker="The block is watched"
            rows={after}
          />
        </div>
      </div>
    </section>
  );
}

function TimelineColumn({
  kind,
  heading,
  kicker,
  rows,
}: {
  kind: "before" | "after";
  heading: string;
  kicker: string;
  rows: { ts: string; label: string; muted?: boolean; bold?: boolean }[];
}) {
  const isAfter = kind === "after";
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  return (
    <div
      ref={ref}
      className={`relative flex h-full flex-col p-6 ${
        isAfter ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`font-mono text-[10px] uppercase tracking-widest ${
            isAfter ? "text-neutral-400" : "text-neutral-500"
          }`}
        >
          {kicker}
        </span>
        <span
          className={`font-mono text-[10px] uppercase tracking-widest ${
            isAfter ? "text-neutral-400" : "text-neutral-400"
          }`}
        >
          {isAfter ? "with watchdog" : "without"}
        </span>
      </div>
      <h3 className="mt-2 font-mono text-2xl tracking-tight">{heading}</h3>
      <ol
        className={`mt-6 divide-y ${
          isAfter ? "divide-neutral-800" : "divide-neutral-200"
        }`}
      >
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-baseline gap-3 py-2 font-mono text-[12px]"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0)" : "translateY(8px)",
              transition: `opacity 540ms ease-out ${i * 120}ms, transform 540ms ease-out ${i * 120}ms`,
            }}
          >
            <span
              className={`tabular-nums ${
                isAfter ? "text-neutral-400" : "text-neutral-400"
              }`}
            >
              {r.ts}
            </span>
            <span
              className={
                isAfter
                  ? r.bold
                    ? "text-white"
                    : "text-neutral-300"
                  : "text-neutral-700"
              }
            >
              {r.label}
            </span>
          </li>
        ))}
      </ol>
      <p
        className={`mt-6 border-t pt-4 font-mono text-[11px] uppercase tracking-widest ${
          isAfter
            ? "border-neutral-800 text-neutral-300"
            : "border-neutral-200 text-neutral-500"
        }`}
      >
        {isAfter
          ? "→ resolved in 10 min · clip + report ready"
          : "→ resolved? · maybe in 90 days · maybe never"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benefits
// ---------------------------------------------------------------------------

function OwnerBenefits() {
  const benefits = [
    {
      n: "01",
      title: "24/7 eyes on your shop",
      body: "We watch your CCTV so you don't have to. Break-ins, vandalism, and after-hours loitering trigger an SMS the moment we detect them.",
    },
    {
      n: "02",
      title: "Faster response on your block",
      body: "Your camera plus your neighbor's plus city signals get fused into one incident. Dispatchers see the full picture and route officers faster.",
    },
    {
      n: "03",
      title: "Audit log on every query",
      body: "Every dispatcher and officer view is logged: who, when, which incident. You can revoke at any time. No black box.",
    },
    {
      n: "04",
      title: "You set the policy",
      body: "Hours, blackout zones, query types, warrant requirements. Policy-as-code, enforced on our side. Your rules.",
    },
  ];
  return (
    <section className="border-b border-neutral-200 bg-neutral-50/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex items-baseline justify-between gap-6">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Why join
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            four reasons · zero cost
          </span>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-px bg-neutral-200 md:grid-cols-2">
          {benefits.map((b, i) => (
            <BenefitCard key={b.n} {...b} delay={i * 120} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BenefitCard({
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
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  return (
    <div
      ref={ref}
      className="group relative bg-white p-8 transition-colors hover:bg-black hover:text-white"
      style={{
        opacity: inView ? 1 : 0,
        animation: inView
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

// ---------------------------------------------------------------------------
// Process — connected timeline (4 steps, with dashed arrows between)
// ---------------------------------------------------------------------------

function OwnerProcess() {
  const steps = [
    {
      n: "01",
      title: "Apply",
      caption:
        "Drop your email, business name, and storefront address. 30 seconds.",
      meta: "30 sec",
    },
    {
      n: "02",
      title: "Verify ownership",
      caption:
        "Upload a utility bill, business license, or lease. One-time check.",
      meta: "5 min",
    },
    {
      n: "03",
      title: "Connect your camera",
      caption:
        "RTSP, HLS, or ONVIF — we provide the bridge. We don't store video; we proxy it.",
      meta: "10 min",
    },
    {
      n: "04",
      title: "Set your policy & go live",
      caption:
        "Hours, blackout zones, query types, warrant requirements. Policy enforced on our side.",
      meta: "2 min",
    },
  ];
  return (
    <section id="how-to-join" className="border-b border-neutral-200">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex items-baseline justify-between gap-6">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            How to join
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            four steps · &lt; 20 min total
          </span>
        </div>
        <p className="mt-6 max-w-2xl font-mono text-sm leading-relaxed text-neutral-700">
          A real person on our team walks you through every step. No
          install fees. No contracts. Cancel and disconnect any time.
        </p>

        {/* Desktop: horizontal timeline with dashed connectors */}
        <ol className="relative mt-12 hidden lg:grid lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch lg:gap-0">
          <ProcessNode {...steps[0]!} delay={0} />
          <ProcessConnector delay={140} />
          <ProcessNode {...steps[1]!} delay={140} />
          <ProcessConnector delay={280} />
          <ProcessNode {...steps[2]!} delay={280} />
          <ProcessConnector delay={420} />
          <ProcessNode {...steps[3]!} delay={420} terminal />
        </ol>

        {/* Mobile / tablet: stacked vertical list */}
        <ol className="mt-10 grid grid-cols-1 gap-px bg-neutral-200 md:grid-cols-2 lg:hidden">
          {steps.map((s, i) => (
            <ProcessMobileStep key={s.n} {...s} delay={i * 140} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function ProcessNode({
  n,
  title,
  caption,
  meta,
  delay,
  terminal,
}: {
  n: string;
  title: string;
  caption: string;
  meta: string;
  delay: number;
  terminal?: boolean;
}) {
  const [ref, inView] = useInView<HTMLLIElement>({ threshold: 0.3 });
  return (
    <li
      ref={ref}
      className="relative flex flex-col border border-neutral-200 bg-white p-5"
      style={{
        opacity: inView ? 1 : 0,
        animation: inView
          ? `wd-fade-up 700ms ease-out ${delay}ms forwards`
          : undefined,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-4xl leading-none tracking-tight tabular-nums">
          {n}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {meta}
        </span>
      </div>
      <h3 className="mt-4 font-mono text-base tracking-tight">{title}</h3>
      <p className="mt-3 font-mono text-[12px] leading-relaxed text-neutral-700">
        {caption}
      </p>
      {terminal && (
        <span
          className="absolute -right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-black"
          aria-hidden
        >
          ●
        </span>
      )}
    </li>
  );
}

function ProcessConnector({ delay }: { delay: number }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });
  return (
    <div
      ref={ref}
      className="flex items-center justify-center px-2"
      aria-hidden
      style={{
        opacity: inView ? 1 : 0,
        transition: `opacity 600ms ease-out ${delay}ms`,
      }}
    >
      <span className="block h-px w-12 border-t border-dashed border-neutral-400" />
      <span className="ml-1 font-mono text-[10px] text-neutral-400">▸</span>
    </div>
  );
}

function ProcessMobileStep({
  n,
  title,
  caption,
  meta,
  delay,
}: {
  n: string;
  title: string;
  caption: string;
  meta: string;
  delay: number;
}) {
  const [ref, inView] = useInView<HTMLLIElement>({ threshold: 0.2 });
  return (
    <li
      ref={ref}
      className="relative flex h-full flex-col bg-white p-6"
      style={{
        opacity: inView ? 1 : 0,
        animation: inView
          ? `wd-fade-up 700ms ease-out ${delay}ms forwards`
          : undefined,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-3xl leading-none tracking-tight text-neutral-200 tabular-nums">
          {n}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {meta}
        </span>
      </div>
      <h3 className="mt-4 font-mono text-base tracking-tight">{title}</h3>
      <p className="mt-3 font-mono text-[12px] leading-relaxed text-neutral-700">
        {caption}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Audit dashboard mock — replaces the plain "what stays in your hands"
// bullets. Showing a real-looking audit log is the strongest trust
// signal we can give an owner.
// ---------------------------------------------------------------------------

interface AuditRow {
  ts: string;
  officer: string;
  badge: string;
  action: "viewed" | "denied" | "clip";
  incident: string;
  reason: string;
}

function OwnerAuditDashboard() {
  const rows: AuditRow[] = [
    {
      ts: "22:50:14",
      officer: "Off. Reyes",
      badge: "4B21",
      action: "viewed",
      incident: "INC #1242",
      reason: "245 ADW · 200m · within policy",
    },
    {
      ts: "22:50:08",
      officer: "Off. Patel",
      badge: "4D05",
      action: "viewed",
      incident: "INC #1241",
      reason: "594 vandalism · same block",
    },
    {
      ts: "14:12:03",
      officer: "Det. Kim",
      badge: "DT88",
      action: "denied",
      incident: "INC #1238",
      reason: "outside policy hours · 8 AM–12 AM only",
    },
    {
      ts: "12:04:51",
      officer: "Off. Nguyen",
      badge: "4D14",
      action: "clip",
      incident: "INC #1237",
      reason: "clip exported · with warrant #SF-26-1422",
    },
  ];
  return (
    <section className="border-b border-neutral-200 bg-neutral-50/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              What stays in your hands
            </h2>
            <p className="mt-4 font-mono text-2xl leading-tight tracking-tight md:text-3xl">
              Every query against your camera is in your audit log.
            </p>
            <ul className="mt-8 space-y-3 font-mono text-sm text-neutral-700">
              <ControlLine
                label="You see every query."
                body="Dispatcher, badge, incident, timestamp. Real-time push to your phone."
                delay={0}
              />
              <ControlLine
                label="You set the policy."
                body="Hours, blackout zones, warrant requirements. We deny queries outside it."
                delay={120}
              />
              <ControlLine
                label="You can revoke instantly."
                body="One click pulls your feed. No phone tree. No 30-day notice."
                delay={240}
              />
            </ul>
          </div>
          <AuditLogMock rows={rows} />
        </div>
      </div>
    </section>
  );
}

function ControlLine({
  label,
  body,
  delay,
}: {
  label: string;
  body: string;
  delay: number;
}) {
  const [ref, inView] = useInView<HTMLLIElement>({ threshold: 0.3 });
  return (
    <li
      ref={ref}
      className="border-l border-neutral-300 pl-4"
      style={{
        opacity: inView ? 1 : 0,
        animation: inView
          ? `wd-fade-up 700ms ease-out ${delay}ms forwards`
          : undefined,
      }}
    >
      <span className="font-semibold text-black">{label}</span>{" "}
      <span className="text-neutral-700">{body}</span>
    </li>
  );
}

function AuditLogMock({ rows }: { rows: AuditRow[] }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  return (
    <div ref={ref} className="relative">
      <div className="absolute -inset-1 -z-10 bg-neutral-100" aria-hidden />
      <div className="border border-black bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-black"
              style={{ animation: "wd-pulse-dot 1.4s ease-in-out infinite" }}
            />
            Your audit log · cam 14b
          </span>
          <span className="tabular-nums">last 24h</span>
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 border-b border-neutral-200 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          <span>Time</span>
          <span>Officer · query</span>
          <span>Action</span>
        </div>
        <ol className="divide-y divide-neutral-100">
          {rows.map((r, i) => (
            <li
              key={r.ts + r.badge}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-2.5 font-mono text-[11px]"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? "translateY(0)" : "translateY(6px)",
                transition: `opacity 480ms ease-out ${i * 140}ms, transform 480ms ease-out ${i * 140}ms`,
              }}
            >
              <span className="tabular-nums text-neutral-500">{r.ts}</span>
              <span className="min-w-0">
                <span className="block truncate">
                  <span className="text-black">{r.officer}</span>{" "}
                  <span className="text-neutral-400">· {r.badge}</span>{" "}
                  <span className="text-neutral-400">· {r.incident}</span>
                </span>
                <span className="block truncate text-[10px] text-neutral-500">
                  {r.reason}
                </span>
              </span>
              <AuditActionBadge action={r.action} />
            </li>
          ))}
        </ol>
        <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <Caret /> live · 4 events · 1 denied
        </div>
      </div>
    </div>
  );
}

function AuditActionBadge({ action }: { action: AuditRow["action"] }) {
  const styles: Record<
    AuditRow["action"],
    { label: string; cls: string }
  > = {
    viewed: {
      label: "viewed",
      cls: "border-black bg-white text-black",
    },
    denied: {
      label: "denied",
      cls: "border-black bg-black text-white",
    },
    clip: {
      label: "clip",
      cls: "border-neutral-400 bg-neutral-100 text-neutral-700",
    },
  };
  const s = styles[action];
  return (
    <span
      className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${s.cls}`}
    >
      {s.label}
    </span>
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

// ---------------------------------------------------------------------------
// FAQ — progressive disclosure using native <details>
// ---------------------------------------------------------------------------

function OwnerFAQ() {
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: "Will dispatchers see inside my private back room or office?",
      a: (
        <>
          No. You define blackout zones in your dashboard (drag rectangles
          on a still frame). We crop those regions{" "}
          <span className="text-black">before</span> the feed leaves our
          proxy. They never reach any dispatcher.
        </>
      ),
    },
    {
      q: "Is this facial recognition?",
      a: (
        <>
          No. WatchDog does{" "}
          <span className="text-black">not run facial recognition</span> on
          your feed. California AB 1215 forbids it on most body camera
          systems, and we extend that ban to ours by default. We detect
          motion, loitering, and basic event types — not identities.
        </>
      ),
    },
    {
      q: "What happens if I want out?",
      a: (
        <>
          One click in your dashboard pulls your feed from the network.
          Effective immediately. No 30-day notice, no phone tree, no
          cancellation fee. We delete any retained clips on request.
        </>
      ),
    },
    {
      q: "Do you sell my video to anyone?",
      a: (
        <>
          No. We don't sell, license, or share your video with third
          parties — including insurance companies. Government access is
          limited to the policy you set, and every access is in your
          audit log.
        </>
      ),
    },
    {
      q: "What about my insurance? Do they get access?",
      a: (
        <>
          Not from us. If you want to share footage with your insurer
          after an incident, you can export a clip from your own
          dashboard and forward it yourself. We never share with insurers
          on your behalf.
        </>
      ),
    },
    {
      q: "What does it cost — really?",
      a: (
        <>
          $0 today. WatchDog is non-profit pilot funded by the YC GStack
          x GBrain hackathon and SF Open Data infrastructure. If we ever
          monetize, you'll be grandfathered into the pilot tier at $0
          forever.
        </>
      ),
    },
  ];

  return (
    <section className="border-b border-neutral-200">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Questions you're already asking
        </h2>
        <p className="mt-4 font-mono text-2xl leading-tight tracking-tight md:text-3xl">
          Six honest answers.
        </p>
        <div className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
          {items.map((it, i) => (
            <FaqItem key={i} q={it.q} a={it.a} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({
  q,
  a,
  index,
}: {
  q: string;
  a: React.ReactNode;
  index: number;
}) {
  const [ref, inView] = useInView<HTMLDetailsElement>({ threshold: 0.2 });
  return (
    <details
      ref={ref}
      className="group py-4"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(8px)",
        transition: `opacity 600ms ease-out ${index * 80}ms, transform 600ms ease-out ${index * 80}ms`,
      }}
    >
      <summary className="flex cursor-pointer items-baseline justify-between gap-3 list-none">
        <span className="font-mono text-sm tracking-tight text-black">
          {q}
        </span>
        <span
          aria-hidden
          className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-3 max-w-2xl font-mono text-sm leading-relaxed text-neutral-700">
        {a}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Waitlist form — kept structurally identical to last pass; tightened copy.
// ---------------------------------------------------------------------------

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; duplicate: boolean }
  | { kind: "error"; message: string };

function OwnerWaitlist() {
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [cameraType, setCameraType] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/contributor-waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          businessName,
          address,
          contactName,
          cameraType,
          message,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        duplicate?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setState({
          kind: "error",
          message: body.error ?? "Something went wrong. Try again.",
        });
        return;
      }
      setState({ kind: "ok", duplicate: Boolean(body.duplicate) });
    } catch {
      setState({ kind: "error", message: "Network error. Try again." });
    }
  }

  const submitting = state.kind === "submitting";
  const done = state.kind === "ok";

  return (
    <section
      id="waitlist"
      className="border-b border-neutral-200 bg-neutral-50/60"
    >
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Join the waitlist
        </h2>
        <p className="mt-4 font-mono text-2xl tracking-tight md:text-3xl">
          A real human will reach out within 48 hours.
        </p>
        <p className="mt-4 font-mono text-sm leading-relaxed text-neutral-700">
          We're onboarding storefronts in San Francisco first, then
          expanding to the rest of CalTrans District 4. Only email is
          required — the rest helps us prioritize.
        </p>

        {done ? (
          <div
            className="mt-10 border border-black bg-black p-6 text-white"
            style={{ animation: "wd-fade-up 500ms ease-out" }}
          >
            <p className="font-mono text-sm uppercase tracking-widest">
              {state.kind === "ok" && state.duplicate
                ? "You're already on the list."
                : "You're on the list."}
            </p>
            <p className="mt-2 font-mono text-[12px] leading-relaxed text-neutral-300">
              We'll be in touch at <span className="text-white">{email}</span>{" "}
              with next steps. In the meantime, flip the toggle at the top
              to the dispatcher view to see exactly what police see when
              they query a camera.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-10 grid grid-cols-1 gap-px border border-neutral-200 bg-neutral-200 md:grid-cols-2"
          >
            <Field
              label="Email"
              required
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@yourshop.com"
              autoComplete="email"
            />
            <Field
              label="Business name"
              value={businessName}
              onChange={setBusinessName}
              placeholder="Mission Market"
              autoComplete="organization"
            />
            <Field
              label="Storefront address"
              value={address}
              onChange={setAddress}
              placeholder="2401 Mission St, SF"
              autoComplete="street-address"
              full
            />
            <Field
              label="Contact name"
              value={contactName}
              onChange={setContactName}
              placeholder="Your name"
              autoComplete="name"
            />
            <Field
              label="Camera type"
              value={cameraType}
              onChange={setCameraType}
              placeholder="e.g. Hikvision, Ring, Nest, unsure"
            />
            <FieldArea
              label="Anything we should know?"
              value={message}
              onChange={setMessage}
              placeholder="Optional — context, hours, concerns…"
            />
            <div className="col-span-1 flex flex-col gap-3 bg-white p-4 md:col-span-2 md:flex-row md:items-center md:justify-between">
              <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                By submitting you agree we may contact you about
                onboarding. No spam. No data sold.
              </p>
              <button
                type="submit"
                disabled={submitting || email.length === 0}
                className="border border-black bg-black px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Join waitlist →"}
              </button>
            </div>
            {state.kind === "error" && (
              <p
                role="alert"
                className="col-span-1 bg-white px-4 pb-4 font-mono text-[11px] uppercase tracking-widest text-black md:col-span-2"
              >
                {state.message}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  autoComplete,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  full?: boolean;
}) {
  return (
    <label
      className={`flex flex-col gap-1 bg-white p-4 ${full ? "md:col-span-2" : ""}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
        {required && <span className="ml-1 text-black">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="border-b border-neutral-200 bg-transparent py-1 font-mono text-sm text-black placeholder:text-neutral-300 focus:border-black focus:outline-none"
      />
    </label>
  );
}

function FieldArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 bg-white p-4 md:col-span-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="resize-none border-b border-neutral-200 bg-transparent py-1 font-mono text-sm text-black placeholder:text-neutral-300 focus:border-black focus:outline-none"
      />
    </label>
  );
}

function wait(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
