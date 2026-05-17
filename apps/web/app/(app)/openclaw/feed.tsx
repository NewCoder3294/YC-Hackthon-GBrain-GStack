"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import { LiveStream } from "@/components/cameras/live-stream";

export type DecisionHint = "act" | "hold" | "review" | "dismiss";
export type Severity = "low" | "med" | "high";

export interface CameraInfo {
  streamUrl: string;
  streamType: "hls" | "mjpeg";
  /** Short location label like "I-280 N" */
  label: string;
}

export interface ActivityCard {
  key: string;
  ts: string;
  incidentId: string | null;
  title: string;
  narrative: string | null;
  decisionHint: DecisionHint | null;
  enriched: boolean;
  severity: Severity;
  tags: string[];
  mix: string | null;
  pageSlug: string | null;
  /** Linked camera for the row's live thumbnail. */
  camera: CameraInfo | null;
}

type SeverityFilter = "all" | Severity;
type DecisionFilter = "all" | DecisionHint;

const SEVERITY_PILLS: { v: SeverityFilter; label: string }[] = [
  { v: "all", label: "All" },
  { v: "high", label: "High" },
  { v: "med", label: "Med" },
  { v: "low", label: "Low" },
];

const DECISION_PILLS: { v: DecisionFilter; label: string }[] = [
  { v: "all", label: "All" },
  { v: "act", label: "Act" },
  { v: "hold", label: "Hold" },
  { v: "review", label: "Review" },
  { v: "dismiss", label: "Dismiss" },
];

const SEVERITY_STRIPE: Record<Severity, string> = {
  high: "bg-black",
  med: "bg-neutral-500",
  low: "bg-neutral-200",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  high: "border-black bg-black text-white",
  med: "border-neutral-700 bg-white text-neutral-700",
  low: "border-neutral-300 bg-white text-neutral-500",
};

const DECISION_BADGE: Record<DecisionHint, string> = {
  act: "border-black bg-black text-white",
  hold: "border-black bg-white text-black",
  review: "border-neutral-400 bg-white text-neutral-600",
  dismiss: "border-neutral-300 bg-neutral-50 text-neutral-400 line-through",
};

function formatRelative(ts: string): string {
  const dt = Date.now() - new Date(ts).getTime();
  if (dt < 60_000) return `${Math.max(1, Math.floor(dt / 1000))}s ago`;
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

function bucketOf(ts: string): "now" | "hour" | "today" | "older" {
  const dt = Date.now() - new Date(ts).getTime();
  if (dt < 5 * 60_000) return "now";
  if (dt < 60 * 60_000) return "hour";
  if (dt < 24 * 60 * 60_000) return "today";
  return "older";
}

const BUCKET_LABEL: Record<"now" | "hour" | "today" | "older", string> = {
  now: "Just now",
  hour: "Last hour",
  today: "Earlier today",
  older: "Yesterday & older",
};

function prettyTag(tag: string): string {
  const idx = tag.indexOf(":");
  return idx > 0 ? tag.slice(idx + 1) : tag;
}

interface Props {
  cards: ActivityCard[];
}

export function OpenclawFeed({ cards }: Props) {
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [decision, setDecision] = useState<DecisionFilter>("all");
  /**
   * Default: show everything (raw + Claude-enriched). Toggle off to
   * narrow to just Claude-described cards.
   */
  const [showRaw, setShowRaw] = useState(true);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (!showRaw && !c.narrative) return false;
      if (severity !== "all" && c.severity !== severity) return false;
      if (decision !== "all" && c.decisionHint !== decision) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.narrative ?? "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [cards, severity, decision, showRaw, query]);

  const rawHiddenCount = useMemo(
    () => (showRaw ? 0 : cards.filter((c) => !c.narrative).length),
    [cards, showRaw],
  );

  const groups = useMemo(() => {
    const map = new Map<"now" | "hour" | "today" | "older", ActivityCard[]>();
    for (const c of filtered) {
      const k = bucketOf(c.ts);
      const list = map.get(k) ?? [];
      list.push(c);
      map.set(k, list);
    }
    return (["now", "hour", "today", "older"] as const)
      .map((k) => ({ key: k, label: BUCKET_LABEL[k], items: map.get(k) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <FilterGroup
          label="Severity"
          options={SEVERITY_PILLS}
          value={severity}
          onChange={setSeverity}
        />
        <div className="h-4 w-px bg-neutral-200" />
        <FilterGroup
          label="Decision"
          options={DECISION_PILLS}
          value={decision}
          onChange={setDecision}
        />
        <div className="h-4 w-px bg-neutral-200" />
        <button
          onClick={() => setShowRaw((v) => !v)}
          className={cn(
            "flex h-7 items-center gap-1.5 border px-2 font-mono text-[10px] uppercase tracking-widest",
            showRaw
              ? "border-black bg-black text-white"
              : "border-neutral-200 bg-white text-neutral-500 hover:border-black hover:text-black",
          )}
          title={
            showRaw
              ? "Hide cards with no Claude description"
              : "Show pre-Claude raw cards too"
          }
        >
          <span
            className={cn(
              "h-1.5 w-1.5",
              showRaw ? "bg-white" : "bg-neutral-300",
            )}
          />
          {showRaw ? "All" : "Claude only"}
          {rawHiddenCount > 0 && (
            <span className="text-neutral-400">· {rawHiddenCount} hidden</span>
          )}
        </button>
        <label className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="title / tag / narrative"
            className="h-7 w-56 border border-neutral-200 bg-white px-2 font-mono text-xs placeholder:text-neutral-300 focus:border-black focus:outline-none"
          />
        </label>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {filtered.length} / {cards.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <p className="font-mono text-xs text-neutral-400">
            No activity matches these filters.
          </p>
        </div>
      ) : (
        <ol className="flex-1 overflow-y-auto">
          {groups.map((g) => (
            <li key={g.key} className="border-b border-neutral-200 last:border-b-0">
              <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400 backdrop-blur">
                {g.label}
                <span className="ml-2 text-neutral-300">· {g.items.length}</span>
              </div>
              <ul className="divide-y divide-neutral-100">
                {g.items.map((c) => (
                  <Card key={c.key} card={c} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Card({ card }: { card: ActivityCard }) {
  return (
    <li className="group relative flex gap-3 px-4 py-3 hover:bg-neutral-50">
      <div
        className={cn(
          "shrink-0 self-stretch w-0.5 rounded-full",
          SEVERITY_STRIPE[card.severity],
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
              SEVERITY_BADGE[card.severity],
            )}
          >
            {card.severity}
          </span>
          {card.enriched && (
            <span
              title="Enriched by Claude"
              className="shrink-0 border border-neutral-900 bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-900"
            >
              claude
            </span>
          )}
          {card.decisionHint && (
            <span
              title={`Decision hint: ${card.decisionHint}`}
              className={cn(
                "shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                DECISION_BADGE[card.decisionHint],
              )}
            >
              {card.decisionHint}
            </span>
          )}
          <h3 className="min-w-0 truncate font-mono text-[13px] font-medium text-black">
            {card.title}
          </h3>
        </div>

        {card.narrative && (
          <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-neutral-700">
            {card.narrative}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
          {card.mix && (
            <span className="border border-neutral-200 bg-white px-1.5 py-0.5 text-neutral-600">
              {card.mix}
            </span>
          )}
          {card.tags.map((t) => (
            <span key={t}>#{prettyTag(t)}</span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        <span className="tabular-nums">{formatRelative(card.ts)}</span>
        {card.camera ? (
          card.incidentId ? (
            <Link
              href={`/incidents/${card.incidentId}` as Route}
              className="block"
              title={`Open incident · ${card.camera.label}`}
            >
              <LiveStream
                streamUrl={card.camera.streamUrl}
                streamType={card.camera.streamType}
                showLiveDot
                className="h-[54px] w-[96px] rounded-sm border border-neutral-200 hover:border-black"
              />
            </Link>
          ) : (
            <LiveStream
              streamUrl={card.camera.streamUrl}
              streamType={card.camera.streamType}
              showLiveDot
              className="h-[54px] w-[96px] rounded-sm border border-neutral-200"
            />
          )
        ) : (
          <div className="flex h-[54px] w-[96px] items-center justify-center rounded-sm border border-dashed border-neutral-200 text-[9px] text-neutral-300">
            no feed
          </div>
        )}
        {card.incidentId && (
          <Link
            href={`/incidents/${card.incidentId}` as Route}
            className="text-neutral-500 hover:text-black"
          >
            open →
          </Link>
        )}
      </div>
    </li>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <div className="flex">
        {options.map((opt, i) => (
          <button
            key={opt.v}
            onClick={() => onChange(opt.v)}
            className={cn(
              "h-7 border border-neutral-200 px-2 font-mono text-[10px] uppercase tracking-widest",
              value === opt.v
                ? "border-black bg-black text-white"
                : "bg-white text-neutral-600 hover:border-black hover:text-black",
              i > 0 && "border-l-0",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
