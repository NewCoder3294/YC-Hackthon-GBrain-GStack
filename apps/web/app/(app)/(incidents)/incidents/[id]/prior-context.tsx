import "server-only";
import { gbrainPriorContext, type GbrainSearchHit } from "@/app/(app)/(intel)/kg/actions";

interface Props {
  incidentId: string;
}

const KIND_LABELS: Record<string, string> = {
  pattern: "pattern",
  baseline: "baseline",
  intel_note: "intel",
  reviewed_incident: "prior incident",
};

function bodyOneLiner(body: string): string {
  return body
    .replace(/^#.*$/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function confidenceLabel(c: number | null): string | null {
  if (c == null) return null;
  if (c >= 0.85) return "high confidence";
  if (c >= 0.65) return "med confidence";
  return "low confidence";
}

export async function PriorContext({ incidentId }: Props) {
  let hits: GbrainSearchHit[] = [];
  let queryErr: string | null = null;
  try {
    hits = await gbrainPriorContext({ incidentId, limit: 6 });
  } catch (e) {
    queryErr = e instanceof Error ? e.message : "GBrain lookup failed";
  }

  if (queryErr) {
    return (
      <p className="font-mono text-[10px] leading-relaxed text-neutral-500">
        GBrain query failed:{" "}
        <span className="text-neutral-700">{queryErr}</span>
      </p>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="space-y-2">
        <p className="font-mono text-[10px] leading-relaxed text-neutral-400">
          No prior records surfaced for this signal yet. GBrain will surface
          matches here as patterns, baselines, and intel notes accumulate.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {hits.map((h) => {
        const kind = KIND_LABELS[h.kind] ?? h.kind;
        const conf = confidenceLabel(h.confidence);
        return (
          <li
            key={h.id}
            className="border border-neutral-200 p-2 transition-colors hover:border-black"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
                {kind}
              </span>
              <span className="font-mono text-[9px] tabular-nums text-neutral-400">
                rank {h.rank.toFixed(2)}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] font-medium text-black">
              {h.title}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-neutral-600">
              {bodyOneLiner(h.body)}
            </p>
            {(conf || h.samples != null || h.tags.length > 0) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                {conf && <span>{conf}</span>}
                {h.samples != null && <span>n={h.samples}</span>}
                {h.tags.slice(0, 4).map((t) => (
                  <span key={t} className="text-neutral-300">
                    #{t.replace(/^(region|signal|pattern|gang|baseline|source|incident|decision|window):/, "")}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
