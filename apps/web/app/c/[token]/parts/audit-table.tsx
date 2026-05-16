import { adminClient } from "@/lib/supabase/admin";

interface AccessEvent {
  id: string;
  requested_at: string;
  requested_by: string;
  legal_basis: string;
  decision: string;
  denial_reason: string | null;
}

export async function AuditTable({ contributorId }: { contributorId: string }) {
  const supabase = adminClient();
  const { data: camIds } = await supabase
    .from("cameras")
    .select("id")
    .eq("contributor_id", contributorId);
  const ids = (camIds ?? []).map((c) => c.id);
  if (ids.length === 0) {
    return <p className="font-mono text-xs text-neutral-500">No cameras yet.</p>;
  }

  let data: AccessEvent[] | null = null;
  try {
    const r = await supabase
      .from("access_events")
      .select("id, requested_at, requested_by, legal_basis, decision, denial_reason")
      .in("camera_id", ids)
      .order("requested_at", { ascending: false })
      .limit(50);
    data = (r.data ?? null) as AccessEvent[] | null;
  } catch {
    data = null;
  }

  if (!data || data.length === 0) {
    return <p className="font-mono text-xs text-neutral-500">No queries against your cameras yet.</p>;
  }
  return (
    <table className="w-full border-collapse border border-neutral-200 text-left">
      <thead>
        <tr className="border-b border-neutral-200 bg-neutral-50">
          <Th>Time</Th>
          <Th>Requester</Th>
          <Th>Basis</Th>
          <Th>Decision</Th>
        </tr>
      </thead>
      <tbody>
        {data.map((e) => (
          <tr key={e.id} className="border-b border-neutral-200">
            <Td>{new Date(e.requested_at).toLocaleString()}</Td>
            <Td>{e.requested_by}</Td>
            <Td>{e.legal_basis}</Td>
            <Td>
              {e.decision}
              {e.denial_reason ? ` (${e.denial_reason})` : ""}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 font-mono text-xs">{children}</td>;
}
