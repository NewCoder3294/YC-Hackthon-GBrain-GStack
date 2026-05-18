import { adminClient } from "@/lib/supabase/admin";
import { DisconnectBridgeButton } from "./disconnect-bridge-button";

interface BridgeRow {
  id: string;
  paired_at: string | null;
  last_seen_at: string | null;
  platform: string;
  app_version: string | null;
}

// Considered "online" when we've heard from the bridge in the last 90s —
// matches the app's 30s heartbeat cadence with 2× tolerance for transient
// drops.
const ONLINE_WINDOW_MS = 90_000;

export async function BridgeStatus({
  contributorId,
  token,
}: {
  contributorId: string;
  token: string;
}) {
  let bridges: BridgeRow[] = [];
  try {
    const sb = adminClient();
    const { data } = await sb
      .from("bridges")
      .select("id, paired_at, last_seen_at, platform, app_version")
      .eq("contributor_id", contributorId)
      .is("removed_at", null)
      .order("created_at", { ascending: false });
    bridges = (data ?? []) as BridgeRow[];
  } catch {
    // bridges table not yet migrated — render the "not paired" placeholder.
  }

  const paired = bridges.filter((b) => b.paired_at !== null);

  if (paired.length === 0) {
    return (
      <p className="font-mono text-xs text-neutral-500">
        No bridge paired yet.
      </p>
    );
  }

  const now = Date.now();
  return (
    <ul className="space-y-2">
      {paired.map((b) => {
        const lastSeenMs = b.last_seen_at
          ? Date.parse(b.last_seen_at)
          : null;
        const online =
          lastSeenMs !== null && now - lastSeenMs < ONLINE_WINDOW_MS;
        const age = lastSeenMs ? formatAge(now - lastSeenMs) : "—";
        return (
          <li
            key={b.id}
            className="flex items-center justify-between border border-neutral-200 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span
                className={
                  online
                    ? "inline-block h-2 w-2 rounded-full bg-black"
                    : "inline-block h-2 w-2 rounded-full bg-neutral-300"
                }
                aria-hidden
              />
              <div>
                <div className="font-mono text-xs">
                  {b.platform}
                  {b.app_version ? ` · v${b.app_version}` : ""}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                  {online ? "online" : `last seen ${age} ago`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                {b.id.slice(0, 8)}
              </span>
              <DisconnectBridgeButton token={token} bridgeId={b.id} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
