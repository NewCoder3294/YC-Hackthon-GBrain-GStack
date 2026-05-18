import { notFound } from "next/navigation";
import { getContributor } from "../_contributor";
import { getOrCreatePendingBridge } from "@/lib/contribute/bridge";
import { RefreshButton } from "./refresh-button";

export const dynamic = "force-dynamic";

// Stage that comes between SMS verification and the dashboard for contributors
// who didn't pre-attach a camera at signup. Walks them through installing the
// WatchDog mobile app on a phone at the shop, pairing it via QR, and letting
// it auto-discover ONVIF cameras on the local WiFi.
export default async function InstallPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contributor = await getContributor(token);
  if (!contributor) notFound();

  // Try to mint a real pairing code via the bridges table. Falls back to a
  // deterministic token-derived code while the 0007_bridges migration is
  // still pending in Supabase — that way the page renders during rollout.
  let pairingCode: string;
  let expiresAt: string | null = null;
  try {
    const pending = await getOrCreatePendingBridge(contributor.id);
    pairingCode = pending?.pairingCode ?? token.slice(0, 6).toUpperCase();
    expiresAt = pending?.expiresAt ?? null;
  } catch {
    pairingCode = token.slice(0, 6).toUpperCase();
  }
  const expiresInMin = expiresAt
    ? Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 60_000))
    : null;

  return (
    <div className="space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="font-mono text-sm uppercase tracking-widest">
          Connect your cameras
        </h1>
        <p className="font-mono text-xs text-neutral-500">
          One-time setup. About 5 minutes. Works with the cameras you already
          have.
        </p>
      </header>

      <Step
        n={1}
        title="Install the WatchDog app"
        body="On any phone at your shop — even an old one in a drawer. Plug it into a USB charger and leave it on a shelf. The app runs as a quiet background service; the phone stays usable."
        cta="App Store / Play Store links — coming soon"
      />

      <Step
        n={2}
        title="Pair it with your account"
        body="Open the app, tap “Pair to WatchDog,” and enter this code:"
        codeBlock={pairingCode}
      >
        <div className="flex items-center gap-3">
          {expiresInMin !== null && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
              expires in {expiresInMin}m
            </span>
          )}
          <RefreshButton token={token} />
        </div>
      </Step>

      <Step
        n={3}
        title="Let it find your cameras"
        body="The app scans your shop’s WiFi for ONVIF-compatible cameras. You confirm each one and enter the camera password once. That’s it — no router config, no port forwarding."
      />

      <Step
        n={4}
        title="You’re done"
        body="Your cameras show up on your dashboard. WatchDog only pulls footage when an incident in your area matches the consent policy you set."
        cta="Visit dashboard"
        href={`/c/${token}`}
      />

      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        Already have a public stream URL? Skip the app — use{" "}
        <code className="font-mono">POST /api/contribute</code> with{" "}
        <code className="font-mono">stream_url</code>.
      </p>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  codeBlock,
  cta,
  href,
  children,
}: {
  n: number;
  title: string;
  body: string;
  codeBlock?: string;
  cta?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-l-2 border-neutral-200 pl-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        Step {n}
      </div>
      <h2 className="mt-0.5 font-mono text-sm">{title}</h2>
      <p className="mt-2 font-mono text-xs leading-relaxed text-neutral-700">
        {body}
      </p>
      {codeBlock && (
        <div className="mt-3 inline-block border border-black px-4 py-2 font-mono text-2xl tracking-[0.4em]">
          {codeBlock}
        </div>
      )}
      {children && <div className="mt-2">{children}</div>}
      {cta && href && (
        <a
          href={href}
          className="mt-3 inline-block border border-black bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white"
        >
          {cta} →
        </a>
      )}
      {cta && !href && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {cta}
        </p>
      )}
    </section>
  );
}
