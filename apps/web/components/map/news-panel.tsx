"use client";

import { cn } from "@/lib/utils";

export interface NewsIncidentRow {
  id: string;
  source: string;
  sourceUrl: string | null;
  title: string;
  summary: string | null;
  crimeType: string;
  severity: "low" | "med" | "high";
  neighborhood: string | null;
  address: string | null;
  lat: number;
  lng: number;
  publishedAt: string;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function NewsPanel({
  incident,
  onClose,
}: {
  incident: NewsIncidentRow;
  onClose: () => void;
}) {
  return (
    <aside className="absolute right-4 top-4 z-10 flex max-h-[calc(100vh-7rem)] w-[420px] flex-col overflow-hidden border border-neutral-200 bg-white">
      <header className="flex items-start justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SeverityChip severity={incident.severity} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              {incident.crimeType}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs leading-snug">{incident.title}</p>
          <p className="mt-1 font-mono text-[10px] text-neutral-500">
            {incident.source} · {formatDate(incident.publishedAt)} ·{" "}
            {relativeDate(incident.publishedAt)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="close"
          className="shrink-0 font-mono text-xs text-neutral-500 hover:text-black"
        >
          ✕
        </button>
      </header>

      <div className="overflow-y-auto">
        <section className="border-b border-neutral-200 px-3 py-3">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Location
          </h3>
          <p className="mt-1 font-mono text-xs">
            {incident.address ?? "—"}
            {incident.neighborhood ? (
              <span className="text-neutral-500"> · {incident.neighborhood}</span>
            ) : null}
          </p>
          <p className="mt-1 font-mono text-[10px] text-neutral-500">
            {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
          </p>
        </section>

        {incident.summary ? (
          <section className="border-b border-neutral-200 px-3 py-3">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Summary
            </h3>
            <p className="mt-1 font-mono text-xs leading-snug">{incident.summary}</p>
          </section>
        ) : null}

        <section className="px-3 py-3">
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Source
          </h3>
          {incident.sourceUrl ? (
            <a
              href={incident.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all font-mono text-xs text-black underline decoration-neutral-300 underline-offset-2 hover:decoration-black"
            >
              {incident.sourceUrl}
            </a>
          ) : (
            <p className="mt-1 font-mono text-xs text-neutral-500">{incident.source}</p>
          )}
        </section>
      </div>
    </aside>
  );
}

function SeverityChip({ severity }: { severity: NewsIncidentRow["severity"] }) {
  const style: Record<NewsIncidentRow["severity"], string> = {
    low: "border-neutral-300 text-neutral-500",
    med: "border-black text-black",
    high: "border-black bg-black text-white",
  };
  return (
    <span
      className={cn(
        "border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        style[severity],
      )}
    >
      {severity}
    </span>
  );
}
