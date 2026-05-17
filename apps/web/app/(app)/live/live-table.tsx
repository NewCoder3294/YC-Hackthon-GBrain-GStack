"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyDemoTime, type DemoTimedRow } from "@/lib/demo-time";
import {
  KIND_GLYPH,
  KIND_LABEL,
  SOURCE_LABEL,
  relativeTime,
  type LiveIncident,
  type LiveIncidentSeverity,
} from "@/lib/live-incidents";
import { cn } from "@/lib/utils";

interface Props {
  rows: LiveIncident[];
}

const TICK_MS = 3_000;
// Mark a row as "new" for this long after it first becomes visible.
const NEW_BADGE_MS = 12_000;

export function LiveTable({ rows }: Props) {
  // The demo anchor is captured once on mount and never moves; the ticker
  // only advances `now`, which is what causes rows to drip in over time.
  const anchorRef = useRef<Date>(new Date());
  const [now, setNow] = useState<Date>(anchorRef.current);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(
    () => applyDemoTime(rows, now, { anchor: anchorRef.current }),
    [rows, now],
  );

  // Track first-seen-at per row so we can flash a brief "NEW" indicator
  // when a row crosses from invisible → visible during the demo.
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  for (const v of visible) {
    if (!firstSeenRef.current.has(v.row.id)) {
      firstSeenRef.current.set(v.row.id, now.getTime());
    }
  }

  if (visible.length === 0) return <EmptyState />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <Th className="w-10">·</Th>
            <Th className="w-24">Source</Th>
            <Th>Call</Th>
            <Th className="w-36">Where</Th>
            <Th className="w-36">Occurred</Th>
            <Th className="w-16">Sev</Th>
            <Th className="w-16">Pri</Th>
            <Th className="w-16">Ack</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => (
            <Row key={entry.row.id} entry={entry} now={now} firstSeen={firstSeenRef.current.get(entry.row.id) ?? now.getTime()} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  entry,
  now,
  firstSeen,
}: {
  entry: DemoTimedRow<LiveIncident>;
  now: Date;
  firstSeen: number;
}) {
  const { row, displayedAt } = entry;
  const isNew = now.getTime() - firstSeen < NEW_BADGE_MS;
  return (
    <tr className="group border-b border-neutral-200 transition-colors hover:bg-neutral-50 data-[new=true]:bg-neutral-50" data-new={isNew ? "true" : undefined}>
      <Td>
        <Link
          href={`/live/${row.id}` as Route}
          aria-label={`Open ${row.title}`}
          className="flex h-6 w-6 items-center justify-center font-mono text-[12px]"
        >
          {KIND_GLYPH[row.kind]}
        </Link>
      </Td>
      <Td>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {SOURCE_LABEL[row.source]}
        </span>
      </Td>
      <Td>
        <Link href={`/live/${row.id}` as Route} className="block font-mono text-xs">
          <div className="flex items-center gap-1.5 text-black">
            {row.title}
            {isNew && (
              <span className="border border-black px-1 font-mono text-[9px] uppercase tracking-widest text-black animate-pulse">
                new
              </span>
            )}
          </div>
          {row.subtitle && (
            <div className="mt-0.5 line-clamp-1 text-neutral-500">{row.subtitle}</div>
          )}
        </Link>
      </Td>
      <Td>
        <div className="font-mono text-xs">{row.neighborhood ?? KIND_LABEL[row.kind]}</div>
        {row.address && (
          <div className="font-mono text-[10px] text-neutral-500">{row.address}</div>
        )}
      </Td>
      <Td>
        <div className="font-mono text-xs">{relativeTime(displayedAt.toISOString(), now)}</div>
        <div className="font-mono text-[10px] text-neutral-500">
          {formatClock(displayedAt)}
        </div>
      </Td>
      <Td>
        <SeverityBadge severity={row.severity} />
      </Td>
      <Td>
        <span className="font-mono text-xs">{row.priority ?? "—"}</span>
      </Td>
      <Td>
        {row.acknowledgedAt ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            ✓
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
            —
          </span>
        )}
      </Td>
    </tr>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
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

function SeverityBadge({ severity }: { severity: LiveIncidentSeverity }) {
  const style: Record<LiveIncidentSeverity, string> = {
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

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <div className="max-w-sm text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          Waiting for the first incident to drip in…
        </p>
        <p className="mt-2 font-mono text-xs text-neutral-300">
          Adjust filters or wait a few seconds.
        </p>
      </div>
    </div>
  );
}

function formatClock(d: Date): string {
  return d.toISOString().slice(11, 16);
}
