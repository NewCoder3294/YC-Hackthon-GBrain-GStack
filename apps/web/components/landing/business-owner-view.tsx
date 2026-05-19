"use client";

import { useEffect, useRef, useState } from "react";
import { LiveStream } from "@/components/cameras/live-stream";

// Public Caltrans D4 HLS feed — proxied through /api/hls.
// Falls back to an "offline" overlay if the stream is down.
const LANDING_PREVIEW_STREAM =
  "https://wzmedia.dot.ca.gov/D4/N101_at_6th.stream/playlist.m3u8";

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
      <OwnerBenefits />
      <OwnerProcess />
      <OwnerControl />
      <OwnerWaitlist />
    </>
  );
}

function OwnerHero() {
  return (
    <section className="relative border-b border-neutral-200">
      <div className="wd-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-28 lg:pt-24">
        <div>
          <span className="inline-flex items-center gap-2 border border-black bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-black">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-black"
              style={{ animation: "wd-pulse-dot 1.6s ease-in-out infinite" }}
            />
            For shop &amp; business owners
          </span>
          <h1 className="mt-6 font-mono text-3xl leading-[1.1] tracking-tight md:text-5xl">
            Your camera.
            <br />
            <span className="text-neutral-400">Their backup.</span>
          </h1>
          <p className="mt-8 max-w-xl font-mono text-sm leading-relaxed text-neutral-700">
            Most storefront CCTV records to a hard drive nobody reviews
            until something goes wrong. Connect your feed to WatchDog and
            we watch it 24/7 — alerts on break-ins, vandalism, and
            suspicious activity at your block, with{" "}
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
        <OwnerAlertMock />
      </div>
    </section>
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

// Stylized alert card mocking what an owner would see on their phone
// when WatchDog detects activity at or near their storefront.
function OwnerAlertMock() {
  const [phase, setPhase] = useState<"idle" | "alert" | "ack">("idle");
  useEffect(() => {
    let cancelled = false;
    async function loop() {
      while (!cancelled) {
        setPhase("idle");
        await wait(1400);
        if (cancelled) return;
        setPhase("alert");
        await wait(2600);
        if (cancelled) return;
        setPhase("ack");
        await wait(2400);
      }
    }
    loop();
    return () => {
      cancelled = true;
    };
  }, []);
  const showAlert = phase === "alert" || phase === "ack";
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
            Your store · MISSION ST
          </span>
          <span className="tabular-nums">CAM 14B · live</span>
        </div>

        <LiveStream
          streamUrl={LANDING_PREVIEW_STREAM}
          streamType="hls"
          className="flex-1"
          lazy={false}
          showLiveDot
        />

        <div
          className="shrink-0 overflow-hidden border-t"
          style={{
            background: showAlert ? "#000" : "#fff",
            borderColor: showAlert ? "#000" : "#e5e5e5",
            color: showAlert ? "#fff" : "#a3a3a3",
            transition: "background 280ms ease, color 280ms ease, border-color 280ms ease",
            minHeight: 112,
          }}
        >
          <div className="px-3 py-3">
            {showAlert ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-widest">
                    <span className="border border-white px-1 py-0.5 text-[9px]">
                      alert
                    </span>
                    Suspicious activity · 2:14 AM
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
                    sent · sms
                  </span>
                </div>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
                  Two figures near front door · loitering &gt; 60s
                </p>
                {phase === "ack" && (
                  <p
                    className="mt-2 font-mono text-[10px] uppercase tracking-widest text-white"
                    style={{ animation: "wd-fade-up 360ms ease-out" }}
                  >
                    → SFPD notified · Co. D · ETA 3 min
                  </p>
                )}
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

function OwnerBenefits() {
  const benefits = [
    {
      n: "01",
      title: "24/7 eyes on your shop",
      body: "We watch your CCTV so you don't have to. Break-ins, vandalism, suspicious loitering after hours — you get an SMS the moment it's detected.",
    },
    {
      n: "02",
      title: "Faster response on your block",
      body: "When something happens nearby, your camera plus your neighbor's plus city signals get fused into one incident. Dispatchers see the full picture and route officers faster.",
    },
    {
      n: "03",
      title: "Audit log on every query",
      body: "Every time a dispatcher or officer views your feed, you see it: who, when, which incident. Full provenance. You can revoke at any time.",
    },
    {
      n: "04",
      title: "You set the policy",
      body: "Only daytime? Only after-hours? Only when a 911 call comes in within 200m? Blackout your private back room. Require a warrant for archive access. Policy-as-code, your rules.",
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

function OwnerProcess() {
  const steps = [
    {
      n: "01",
      title: "Apply",
      caption:
        "Drop your email, business name, and storefront address below. Takes 30 seconds. We screen for jurisdiction and stream type.",
      meta: "30 sec",
    },
    {
      n: "02",
      title: "Verify ownership",
      caption:
        "Upload a utility bill, business license, or lease showing the address. One-time check so we know the camera is yours to share.",
      meta: "5 min",
    },
    {
      n: "03",
      title: "Connect your camera",
      caption:
        "Most modern CCTV speaks RTSP, HLS, or ONVIF. We provide a one-line bridge config or, for older systems, ship a small box that converts it. We don't store your video — we proxy it.",
      meta: "10 min",
    },
    {
      n: "04",
      title: "Set your policy & go live",
      caption:
        "Pick hours, blackout zones, query types, and warrant requirements. Policy is enforced on our side — dispatchers physically cannot query outside it. You get a dashboard with every event.",
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
        <ol className="mt-10 grid grid-cols-1 gap-px bg-neutral-200 md:grid-cols-4">
          {steps.map((s, i) => (
            <ProcessStep key={s.n} {...s} delay={i * 140} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function ProcessStep({
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

function OwnerControl() {
  const lines = [
    {
      label: "You control the time windows.",
      body: "Only nights, only business hours, only when a 911 call lands within 200m. Outside that, your feed is invisible.",
    },
    {
      label: "You control the access.",
      body: "Live preview, archive, clip download — each requires a different policy. Archive can require a warrant; you decide.",
    },
    {
      label: "You see every query.",
      body: "Dispatcher name, badge, incident ID, timestamp. Real-time push and a dashboard you can export to your lawyer.",
    },
    {
      label: "You can revoke instantly.",
      body: "One click in your dashboard pulls your feed from the network. No phone tree. No 30-day notice. Done.",
    },
  ];
  return (
    <section className="border-b border-neutral-200">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          What stays in your hands
        </h2>
        <ul className="mt-6 space-y-3 font-mono text-sm text-neutral-700">
          {lines.map((l, i) => (
            <ControlLine key={l.label} {...l} delay={i * 120} />
          ))}
        </ul>
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
              with next steps. In the meantime, feel free to read the
              dispatcher view to see exactly what police see when they
              query a camera.
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
