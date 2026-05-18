import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { getLiveIncident } from "../data";
import {
  acknowledgeLiveIncident,
  unacknowledgeLiveIncident,
} from "../actions";
import {
  KIND_GLYPH,
  KIND_LABEL,
  SOURCE_LABEL,
  relativeTime,
  type LiveIncidentSeverity,
} from "@/lib/live-incidents";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LiveIncidentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getLiveIncident(id);
  if (!result) notFound();
  const { incident, raw } = result;

  const acknowledged = Boolean(incident.acknowledgedAt);
  const action = acknowledged
    ? unacknowledgeLiveIncident
    : acknowledgeLiveIncident;

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={"/live" as Route}
            className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
          >
            ← Live
          </Link>
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center font-mono text-[13px] leading-none"
          >
            {KIND_GLYPH[incident.kind]}
          </span>
          <h1 className="font-mono text-sm uppercase tracking-widest">
            {incident.title}
          </h1>
          <SeverityBadge severity={incident.severity} />
        </div>
        <form action={action.bind(null, { id: incident.id })}>
          <button
            type="submit"
            className={cn(
              "h-8 border px-3 font-mono text-[10px] uppercase tracking-widest",
              acknowledged
                ? "border-neutral-300 text-neutral-500 hover:border-black hover:text-black"
                : "border-black bg-black text-white",
            )}
          >
            {acknowledged ? "Un-acknowledge" : "Acknowledge"}
          </button>
        </form>
      </header>

      <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <section className="border border-neutral-200">
            <Hdr>Overview</Hdr>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3">
              <Field label="Source" value={SOURCE_LABEL[incident.source]} />
              <Field label="Kind" value={KIND_LABEL[incident.kind]} />
              {incident.priority && (
                <Field label="Priority" value={incident.priority} />
              )}
              {incident.status && <Field label="Status" value={incident.status} />}
              <Field label="Source id" value={incident.sourceUid} mono />
              <Field
                label="Occurred"
                value={`${formatTimestamp(incident.occurredAt)} · ${relativeTime(incident.occurredAt)}`}
                mono
              />
              {incident.acknowledgedAt && (
                <Field
                  label="Acknowledged"
                  value={`${formatTimestamp(incident.acknowledgedAt)} · ${relativeTime(incident.acknowledgedAt)}`}
                  mono
                />
              )}
            </dl>
          </section>

          {incident.subtitle && (
            <section className="border border-neutral-200">
              <Hdr>Detail</Hdr>
              <p className="whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed">
                {incident.subtitle}
              </p>
            </section>
          )}

          <section className="border border-neutral-200">
            <Hdr>Location</Hdr>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3">
              {incident.neighborhood && (
                <Field label="Neighborhood" value={incident.neighborhood} />
              )}
              {incident.address && (
                <Field label="Address" value={incident.address} />
              )}
              <Field
                label="Lat, Lng"
                value={`${incident.lat.toFixed(5)}, ${incident.lng.toFixed(5)}`}
                mono
              />
              <Field label="Precision" value={incident.geoPrecision} />
            </dl>
          </section>
        </div>

        <section className="flex min-h-[320px] flex-col border border-neutral-200">
          <Hdr>Raw source payload</Hdr>
          <pre className="flex-1 overflow-auto bg-neutral-50 px-4 py-3 font-mono text-[10px] leading-relaxed text-neutral-700">
            {raw ? JSON.stringify(raw, null, 2) : "(no raw payload stored)"}
          </pre>
        </section>
      </div>
    </section>
  );
}

function Hdr({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </dt>
      <dd className={cn("text-xs leading-tight", mono ? "font-mono" : "")}>
        {value}
      </dd>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: LiveIncidentSeverity }) {
  const style: Record<LiveIncidentSeverity, string> = {
    low: "border-neutral-300 text-neutral-500",
    med: "border-black text-black",
    high: "border-black bg-black text-white animate-pulse",
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}
