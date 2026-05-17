import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { getContributor } from "../../layout";

export const dynamic = "force-dynamic";

export default async function ContributorIncidentPage({
  params,
}: {
  params: Promise<{ token: string; incident_id: string }>;
}) {
  const { token, incident_id } = await params;
  const contributor = await getContributor(token);
  if (!contributor) notFound();

  const supabase = adminClient();
  const { data: incident } = await supabase
    .from("incidents")
    .select("id, title, severity, notes, created_at")
    .eq("id", incident_id)
    .maybeSingle();
  if (!incident) notFound();

  const { data: cams } = await supabase
    .from("cameras")
    .select("id, description")
    .eq("contributor_id", contributor.id);

  return (
    <article className="space-y-6 p-6">
      <header>
        <h1 className="font-mono text-sm uppercase tracking-widest">{incident.title}</h1>
        <p className="mt-1 font-mono text-[10px] text-neutral-500">
          {incident.severity} · {new Date(incident.created_at).toLocaleString()}
        </p>
      </header>
      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Your cameras (potential contributors)
        </h2>
        <ul className="divide-y divide-neutral-200 border border-neutral-200">
          {(cams ?? []).map((c) => (
            <li key={c.id} className="p-3 font-mono text-xs">
              {c.description}
            </li>
          ))}
        </ul>
      </section>
      {incident.notes && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Notes
          </h2>
          <p className="font-mono text-xs">{incident.notes}</p>
        </section>
      )}
    </article>
  );
}
