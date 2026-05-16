import Link from "next/link";
import type { Route } from "next";
import {
  listDispatchIncidents,
  listDistinctRoutes,
  listDistinctTags,
  listIncidents,
} from "./data";
import { ClipThumbnail } from "./clip-thumbnail";
import { DispatchPlayButton } from "./dispatch-play";
import { IncidentFilters } from "./filters";
import { SeverityBadge } from "./severity-badge";
import type {
  IncidentFilters as Filters,
  IncidentRow,
  IncidentTableRow,
  Severity,
} from "./types";

function parseFilters(raw: Record<string, string | string[] | undefined>): Filters {
  const get = (k: string) => {
    const v = raw[k];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const severity = get("severity");
  const severityValue: Severity | undefined =
    severity === "low" || severity === "med" || severity === "high"
      ? severity
      : undefined;

  const from = get("from");
  const to = get("to");

  const q = get("q");
  const route = get("route");
  const tag = get("tag");
  const result: Filters = {};
  if (q) result.q = q;
  if (route) result.route = route;
  if (tag) result.tag = tag;
  if (severityValue) result.severity = severityValue;
  if (from) result.from = `${from}T00:00:00.000Z`;
  if (to) result.to = `${to}T23:59:59.999Z`;
  return result;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IncidentsPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const [clips, dispatches, routes, tags] = await Promise.all([
    listIncidents(filters),
    listDispatchIncidents(filters),
    listDistinctRoutes(),
    listDistinctTags(),
  ]);

  // Merge + sort newest-first across both kinds.
  const rows: IncidentTableRow[] = [
    ...clips.map((c) => ({ kind: "clip" as const, ...c })),
    ...dispatches,
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const dispatchCount = dispatches.length;
  const clipCount = clips.length;

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm uppercase tracking-widest">
            Incidents
          </h1>
          <span className="font-mono text-xs text-neutral-500">
            {rows.length} {rows.length === 1 ? "result" : "results"}
            {dispatchCount > 0 && (
              <span className="ml-1 text-neutral-400">
                · {clipCount} clip · {dispatchCount} audio
              </span>
            )}
          </span>
        </div>
      </header>

      <IncidentFilters routes={routes} tags={tags} />

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <Th className="w-24">Clip</Th>
                <Th>Camera / Call</Th>
                <Th className="w-28">Route / TG</Th>
                <Th className="w-36">Timestamp</Th>
                <Th className="w-20">Duration</Th>
                <Th>Tags</Th>
                <Th className="w-20">Severity</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                row.kind === "dispatch" ? (
                  <DispatchRow key={row.id} row={row} />
                ) : (
                  <ClipRow key={row.id} row={row} />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClipRow({ row }: { row: { kind: "clip" } & IncidentRow }) {
  const clip = row.primaryClip;
  const cam = clip?.camera;
  const route = cam ? `${cam.route}${cam.direction ? ` ${cam.direction}` : ""}` : "—";
  return (
    <tr className="group border-b border-neutral-200 transition-colors hover:bg-neutral-50">
      <Td>
        <Link
          href={`/incidents/${row.id}` as Route}
          className="block"
          aria-label={`Open incident ${row.title}`}
        >
          <ClipThumbnail
            path={clip?.thumbnailPath}
            fallbackStreamUrl={cam?.streamUrl ?? null}
            fallbackStreamType={cam?.streamType ?? null}
            showLiveDot
          />
        </Link>
      </Td>
      <Td>
        <Link
          href={`/incidents/${row.id}` as Route}
          className="block font-mono text-xs"
        >
          <div className="text-black">{row.title}</div>
          {cam?.description && (
            <div className="mt-0.5 text-neutral-500">{cam.description}</div>
          )}
        </Link>
      </Td>
      <Td>
        <span className="font-mono text-xs">{route}</span>
      </Td>
      <Td>
        <span className="font-mono text-xs">
          {clip ? formatTimestamp(clip.startedAt) : formatTimestamp(row.createdAt)}
        </span>
      </Td>
      <Td>
        <span className="font-mono text-xs">
          {clip ? formatDuration(clip.durationS) : "—"}
        </span>
      </Td>
      <Td>
        {clip && clip.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {clip.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="border border-neutral-200 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-700"
              >
                {t}
              </span>
            ))}
            {clip.tags.length > 4 && (
              <span className="font-mono text-[10px] text-neutral-500">
                +{clip.tags.length - 4}
              </span>
            )}
          </div>
        ) : (
          <span className="font-mono text-[10px] text-neutral-300">—</span>
        )}
      </Td>
      <Td>
        <SeverityBadge severity={row.severity} />
      </Td>
      <Td>
        <p className="line-clamp-1 font-mono text-xs text-neutral-700">
          {row.notes ?? ""}
        </p>
      </Td>
    </tr>
  );
}

function DispatchRow({
  row,
}: {
  row: import("./types").DispatchIncidentRow;
}) {
  return (
    <tr className="group border-b border-neutral-200 bg-neutral-50/40 transition-colors hover:bg-neutral-100">
      <Td>
        <DispatchPlayButton audioUrl={row.audioUrl} fileName={row.fileName} />
      </Td>
      <Td>
        <div className="font-mono text-xs">
          <div className="flex items-center gap-1.5">
            <span className="border border-black bg-black px-1 py-px font-mono text-[8px] uppercase tracking-widest text-white">
              Audio
            </span>
            <span className="text-black">
              {row.callTypeCode ? `${row.callTypeCode} · ` : ""}
              {row.title}
            </span>
          </div>
          <div className="mt-0.5 text-neutral-500">{row.neighborhood}</div>
        </div>
      </Td>
      <Td>
        <span className="font-mono text-xs" title={row.talkgroup}>
          {row.talkgroupId ? `TG ${row.talkgroupId}` : row.talkgroup}
        </span>
      </Td>
      <Td>
        <span className="font-mono text-xs">{formatTimestamp(row.createdAt)}</span>
      </Td>
      <Td>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          audio
        </span>
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          <span className="border border-neutral-200 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
            P{row.priority || "—"}
          </span>
          {row.callTypeCode && (
            <span className="border border-neutral-200 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
              {row.callTypeCode}
            </span>
          )}
        </div>
      </Td>
      <Td>
        <SeverityBadge severity={row.severity} />
      </Td>
      <Td>
        <p className="line-clamp-1 font-mono text-xs text-neutral-700">
          {row.notes}
        </p>
      </Td>
    </tr>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500 ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-middle">{children}</td>;
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <div className="max-w-sm text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          No incidents match
        </p>
        <p className="mt-2 font-mono text-xs text-neutral-300">
          Clear filters, capture a clip from the Live Wall, or drop dispatch
          audio into /public/dispatch-audio/.
        </p>
      </div>
    </div>
  );
}
