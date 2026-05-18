import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { adminClient } from "@/lib/supabase/admin";
import { getContributor } from "./_contributor";
import { CameraList } from "./parts/camera-list";
import { ActivityList } from "./parts/activity-list";
import { AuditTable } from "./parts/audit-table";
import { BridgeStatus } from "./parts/bridge-status";
import { PolicyEditor } from "./parts/policy-editor";
import { RemoveButton } from "./parts/remove-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contributor = await getContributor(token);
  if (!contributor) notFound();

  const supabase = adminClient();
  const { data: cameras } = await supabase
    .from("cameras")
    .select("id, caltrans_id, description, lat, lng, stream_type, is_active")
    .eq("contributor_id", contributor.id)
    .order("last_synced_at", { ascending: true });

  const noCameras = (cameras ?? []).length === 0;
  const installHref = `/c/${token}/install` as Route;

  return (
    <div className="space-y-6 p-6">
      {noCameras && (
        <div className="border border-black bg-white p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            Setup needed
          </div>
          <p className="mt-1 font-mono text-sm">
            Your account is verified. Now connect your cameras via the WatchDog
            app — 5 minutes, no router config.
          </p>
          <Link
            href={installHref}
            className="mt-3 inline-block border border-black bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white"
          >
            Start setup →
          </Link>
        </div>
      )}

      <Section title="Your cameras">
        <CameraList cameras={cameras ?? []} />
      </Section>
      <Section title="Recent activity">
        <ActivityList contributorId={contributor.id} />
      </Section>
      <Section title="Audit log">
        <AuditTable contributorId={contributor.id} />
      </Section>
      <Section title="WatchDog app">
        <BridgeStatus contributorId={contributor.id} token={token} />
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          <Link href={installHref} className="underline-offset-2 hover:underline">
            Pair another phone →
          </Link>
        </p>
      </Section>
      <Section title="Access policy">
        <PolicyEditor token={token} contributorId={contributor.id} />
      </Section>
      <Section title="Danger zone">
        <RemoveButton token={token} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {title}
      </h2>
      {children}
    </section>
  );
}
