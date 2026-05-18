import { adminClient } from "@/lib/supabase/admin";

interface AccessEvent {
  id: string;
  occurred_at: string;
  accessed_by: string;
  legal_basis: string;
  reason: string | null;
  incident_id: string | null;
  camera_id: string;
  allowed: boolean;
  denial_reason: string | null;
}

const BASIS_LABELS: Record<string, string> = {
  standing_consent: "standing consent",
  exigent: "exigent",
  warrant: "warrant",
  public_domain: "public",
};

const DENIAL_LABELS: Record<string, string> = {
  warrant_required: "warrant required",
  blocked_incident_type: "blocked incident type",
  outside_time_window: "outside allowed hours",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}

export async function AuditTable({ contributorId }: { contributorId: string }) {
  const supabase = adminClient();
  const { data: camIds } = await supabase
    .from("cameras")
    .select("id")
    .eq("contributor_id", contributorId);
  const ids = (camIds ?? []).map((c) => c.id);
  if (ids.length === 0) {
    return (
      <p className="font-mono text-xs text-neutral-500">No cameras yet.</p>
    );
  }

  const { data, error } = await supabase
    .from("camera_access_events")
    .select(
      "id, occurred_at, accessed_by, legal_basis, reason, incident_id, camera_id, allowed, denial_reason",
    )
    .in("camera_id", ids)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <p className="font-mono text-xs text-black">
        Audit log unavailable: {error.message}
      </p>
    );
  }

  const events = (data ?? []) as AccessEvent[];
  if (events.length === 0) {
    return (
      <div className="space-y-2 border border-neutral-200 bg-neutral-50 p-4">
        <p className="font-mono text-xs text-neutral-700">
          Nothing has queried your cameras yet.
        </p>
        <p className="font-mono text-[10px] leading-relaxed text-neutral-500">
          Every time an operator pulls a clip or thumbnail from your camera —
          for a dispatched call, a citizen report follow-up, or a manual
          incident review — it'll show up here within seconds, including
          who, why, and on what legal basis.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-neutral-200 text-left font-mono text-[11px]">
        <thead className="bg-neutral-50">
          <tr className="border-b border-neutral-200 text-[9px] uppercase tracking-widest text-neutral-500">
            <th className="px-3 py-2 font-normal">When</th>
            <th className="px-3 py-2 font-normal">Who</th>
            <th className="px-3 py-2 font-normal">Basis</th>
            <th className="px-3 py-2 font-normal">Status</th>
            <th className="px-3 py-2 font-normal">Reason</th>
            <th className="px-3 py-2 font-normal">Incident</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-neutral-100 align-top">
              <td className="px-3 py-2 whitespace-nowrap text-neutral-500">
                {formatTimestamp(e.occurred_at)}
              </td>
              <td className="px-3 py-2 break-all text-black">{e.accessed_by}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={`border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${
                    e.legal_basis === "warrant"
                      ? "border-black bg-black text-white"
                      : e.legal_basis === "exigent"
                        ? "border-neutral-700 bg-white text-neutral-700"
                        : "border-neutral-300 bg-white text-neutral-500"
                  }`}
                >
                  {BASIS_LABELS[e.legal_basis] ?? e.legal_basis}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {e.allowed ? (
                  <span className="border border-neutral-300 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-neutral-600">
                    allowed
                  </span>
                ) : (
                  <span className="border border-black bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-black">
                    denied · {DENIAL_LABELS[e.denial_reason ?? ""] ?? e.denial_reason ?? "policy"}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-neutral-600">{e.reason ?? "—"}</td>
              <td className="px-3 py-2 text-neutral-500">
                {e.incident_id ? e.incident_id.slice(0, 8) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
