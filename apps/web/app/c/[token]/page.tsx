import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { getContributor } from "./layout";
import { CameraList } from "./parts/camera-list";
import { ActivityList } from "./parts/activity-list";
import { AuditTable } from "./parts/audit-table";
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
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6 p-6">
      <Section title="Your cameras">
        <CameraList cameras={cameras ?? []} />
      </Section>
      <Section title="Recent activity">
        <ActivityList contributorId={contributor.id} />
      </Section>
      <Section title="Audit log">
        <AuditTable contributorId={contributor.id} />
      </Section>
      <Section title="Settings">
        <p className="font-mono text-xs text-neutral-500">
          Policy in effect: geofence 500m · all incident types · exigent_ok.
        </p>
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
