import { adminClient } from "@/lib/supabase/admin";

export async function ActivityList({ contributorId }: { contributorId: string }) {
  const supabase = adminClient();
  const { data } = await supabase
    .from("contributor_notifications")
    .select("id, incident_id, body, sent_at, created_at, status, channel")
    .eq("contributor_id", contributorId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data || data.length === 0) {
    return (
      <p className="font-mono text-xs text-neutral-500">
        No incidents yet. We&apos;ll notify you when your cameras participate.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-200 border border-neutral-200">
      {data.map((n) => (
        <li key={n.id} className="p-3">
          <p className="font-mono text-xs">{n.body}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {new Date(n.created_at).toLocaleString()} · {n.channel} · {n.status}
          </p>
        </li>
      ))}
    </ul>
  );
}
