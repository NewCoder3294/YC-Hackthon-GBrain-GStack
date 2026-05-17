"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface FeedItem {
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

type SeverityFilter = "all" | "low" | "med" | "high";

const SEVERITY_PILLS: { v: SeverityFilter; label: string }[] = [
  { v: "all", label: "All" },
  { v: "high", label: "High" },
  { v: "med", label: "Med" },
  { v: "low", label: "Low" },
];

const SEVERITY_STRIPE: Record<"low" | "med" | "high", string> = {
  high: "bg-black",
  med: "bg-neutral-500",
  low: "bg-neutral-200",
};

const SEVERITY_BADGE: Record<"low" | "med" | "high", string> = {
  high: "border-black bg-black text-white",
  med: "border-neutral-700 bg-white text-neutral-700",
  low: "border-neutral-300 bg-white text-neutral-500",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function bucketOf(iso: string): "week" | "month" | "quarter" | "year" | "older" {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 7) return "week";
  if (days < 30) return "month";
  if (days < 90) return "quarter";
  if (days < 365) return "year";
  return "older";
}

const BUCKET_LABEL: Record<"week" | "month" | "quarter" | "year" | "older", string> = {
  week: "This week",
  month: "This month",
  quarter: "Last 90 days",
  year: "This year",
  older: "Older",
};

interface Props {
  items: FeedItem[];
}

export function FeedClient({ items }: Props) {
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [crimeType, setCrimeType] = useState<string>("all");
  const [neighborhood, setNeighborhood] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FeedItem | null>(items[0] ?? null);

  const crimeTypes = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) set.add(i.crimeType);
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const neighborhoods = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.neighborhood) set.add(i.neighborhood);
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) set.add(i.source);
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (severity !== "all" && i.severity !== severity) return false;
      if (crimeType !== "all" && i.crimeType !== crimeType) return false;
      if (neighborhood !== "all" && i.neighborhood !== neighborhood) return false;
      if (source !== "all" && i.source !== source) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.summary ?? "").toLowerCase().includes(q) ||
        (i.address ?? "").toLowerCase().includes(q) ||
        (i.neighborhood ?? "").toLowerCase().includes(q) ||
        i.crimeType.toLowerCase().includes(q)
      );
    });
  }, [items, severity, crimeType, neighborhood, source, query]);

  const groups = useMemo(() => {
    const map = new Map<"week" | "month" | "quarter" | "year" | "older", FeedItem[]>();
    for (const i of filtered) {
      const k = bucketOf(i.publishedAt);
      const list = map.get(k) ?? [];
      list.push(i);
      map.set(k, list);
    }
    return (["week", "month", "quarter", "year", "older"] as const)
      .map((k) => ({ key: k, label: BUCKET_LABEL[k], items: map.get(k) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  return (
    <section className="flex h-full flex-col">
      <header className="border-b border-neutral-200 px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm uppercase tracking-widest">Feed</h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            SF violent crime coverage — news, SFPD press, neighborhood blogs
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-neutral-200 bg-neutral-200 sm:grid-cols-4">
        <Stat label="Total" value={items.length.toString()} sub="items" />
        <Stat
          label="High"
          value={items.filter((i) => i.severity === "high").length.toString()}
          sub="severity"
        />
        <Stat
          label="Sources"
          value={(sources.length - 1).toString()}
          sub="outlets"
        />
        <Stat
          label="Newest"
          value={items[0] ? relativeDate(items[0].publishedAt) : "—"}
          sub={items[0] ? formatDate(items[0].publishedAt) : "no items"}
        />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <FilterGroup
          label="Severity"
          options={SEVERITY_PILLS.map((p) => ({ v: p.v, label: p.label }))}
          value={severity}
          onChange={setSeverity}
        />
        <div className="h-4 w-px bg-neutral-200" />
        <FilterSelect
          label="Type"
          options={crimeTypes}
          value={crimeType}
          onChange={setCrimeType}
        />
        <FilterSelect
          label="Neighborhood"
          options={neighborhoods}
          value={neighborhood}
          onChange={setNeighborhood}
        />
        <FilterSelect
          label="Source"
          options={sources}
          value={source}
          onChange={setSource}
        />
        <label className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="title / address / type"
            className="h-7 w-56 border border-neutral-200 bg-white px-2 font-mono text-xs placeholder:text-neutral-300 focus:border-black focus:outline-none"
          />
        </label>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 tabular-nums">
          {filtered.length} / {items.length}
        </span>
      </div>

      {/* Two-column: list left, detail right */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_28rem]">
        <ol className="overflow-y-auto border-r border-neutral-200">
          {filtered.length === 0 ? (
            <li className="p-8 text-center font-mono text-xs text-neutral-400">
              No items match these filters.
            </li>
          ) : (
            groups.map((g) => (
              <li key={g.key} className="border-b border-neutral-200 last:border-b-0">
                <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400 backdrop-blur">
                  {g.label}
                  <span className="ml-2 text-neutral-300">· {g.items.length}</span>
                </div>
                <ul className="divide-y divide-neutral-100">
                  {g.items.map((it) => (
                    <li
                      key={it.id}
                      onClick={() => setSelected(it)}
                      className={cn(
                        "group flex cursor-pointer gap-3 px-4 py-3 hover:bg-neutral-50",
                        selected?.id === it.id && "bg-neutral-50",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "shrink-0 self-stretch w-0.5 rounded-full",
                          SEVERITY_STRIPE[it.severity],
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span
                            className={cn(
                              "shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                              SEVERITY_BADGE[it.severity],
                            )}
                          >
                            {it.severity}
                          </span>
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
                            {it.crimeType.replace(/_/g, " ")}
                          </span>
                          {it.neighborhood && (
                            <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                              · {it.neighborhood}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1 truncate font-mono text-[12px] font-medium text-black">
                          {it.title}
                        </h3>
                        {it.summary && (
                          <p className="mt-0.5 line-clamp-2 font-mono text-[11px] leading-snug text-neutral-600">
                            {it.summary}
                          </p>
                        )}
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                          {it.source} · {formatDate(it.publishedAt)} ·{" "}
                          {relativeDate(it.publishedAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ol>

        {/* Detail pane (desktop only) */}
        <aside className="hidden overflow-y-auto lg:block">
          {selected ? (
            <DetailPane item={selected} />
          ) : (
            <div className="p-8 text-center font-mono text-xs text-neutral-400">
              Select an item to see the full coverage.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function DetailPane({ item }: { item: FeedItem }) {
  // Try iframe first; fall back to metadata view if the site blocks embed.
  const [mode, setMode] = useState<"web" | "meta">(item.sourceUrl ? "web" : "meta");
  const [iframeFailed, setIframeFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when the selected item changes.
  useEffect(() => {
    setIframeFailed(false);
    setMode(item.sourceUrl ? "web" : "meta");
  }, [item.id, item.sourceUrl]);

  // If iframe doesn't fire onLoad within 6s, assume it's blocked.
  useEffect(() => {
    if (mode !== "web" || !item.sourceUrl) return;
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    setIframeFailed(false);
    loadTimerRef.current = setTimeout(() => setIframeFailed(true), 6_000);
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, [item.sourceUrl, mode]);

  return (
    <article className="flex h-full flex-col">
      {/* Slim sticky header — severity, crime, date, mode toggle, external link */}
      <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={cn(
                "shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                SEVERITY_BADGE[item.severity],
              )}
            >
              {item.severity}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
              {item.crimeType.replace(/_/g, " ")}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
              {relativeDate(item.publishedAt)} · {item.source}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 font-mono text-[12px] leading-snug text-black">
            {item.title}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {item.sourceUrl && (
            <div className="flex border border-neutral-200">
              <button
                type="button"
                onClick={() => setMode("web")}
                className={cn(
                  "px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                  mode === "web"
                    ? "bg-black text-white"
                    : "bg-white text-neutral-500 hover:text-black",
                )}
                title="Render the article in the panel"
              >
                Web
              </button>
              <button
                type="button"
                onClick={() => setMode("meta")}
                className={cn(
                  "border-l border-neutral-200 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                  mode === "meta"
                    ? "bg-black text-white"
                    : "bg-white text-neutral-500 hover:text-black",
                )}
                title="Show summary + location only"
              >
                Info
              </button>
            </div>
          )}
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 hover:text-black"
            >
              open ↗
            </a>
          )}
        </div>
      </header>

      {mode === "web" && item.sourceUrl ? (
        <div className="relative flex-1 overflow-hidden bg-white">
          <iframe
            ref={iframeRef}
            src={item.sourceUrl}
            // sandbox keeps us from inheriting cookies / running malicious top-level
            // navigations; allow-same-origin is needed for many news sites to fetch
            // their own JS, allow-scripts so the page actually renders.
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            referrerPolicy="no-referrer"
            onLoad={() => {
              if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
              setIframeFailed(false);
            }}
            className="h-full w-full border-0"
            data-no-invert
          />
          {iframeFailed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95 p-6 text-center backdrop-blur">
              <p className="font-mono text-[11px] text-neutral-700">
                This site blocks embedded rendering.
              </p>
              <p className="font-mono text-[10px] text-neutral-500">
                It&apos;s a common security header — most outlets do this. The summary
                view still has the article details.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("meta")}
                  className="border border-neutral-200 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600 hover:border-black hover:text-black"
                >
                  show summary
                </button>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-black bg-black px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white"
                >
                  open in new tab ↗
                </a>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {item.summary && (
            <section className="border-b border-neutral-200 px-4 py-3">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                Summary
              </h3>
              <p className="mt-1 font-mono text-[12px] leading-relaxed text-neutral-800">
                {item.summary}
              </p>
            </section>
          )}

          <section className="border-b border-neutral-200 px-4 py-3">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Location
            </h3>
            <p className="mt-1 font-mono text-[12px]">
              {item.address ?? "—"}
              {item.neighborhood && (
                <span className="text-neutral-500"> · {item.neighborhood}</span>
              )}
            </p>
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-neutral-400">
              {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
            </p>
          </section>

          <section className="border-b border-neutral-200 px-4 py-3">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Source
            </h3>
            <p className="mt-1 font-mono text-[12px]">{item.source}</p>
            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-baseline gap-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
              >
                read original →
              </a>
            )}
          </section>

          <section className="px-4 py-3">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              On the map
            </h3>
            <a
              href={`/map?lat=${item.lat}&lng=${item.lng}`}
              className="mt-1 inline-flex items-baseline gap-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black"
            >
              open in map view →
            </a>
          </section>
        </div>
      )}
    </article>
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

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 border border-neutral-200 bg-white px-2 font-mono text-[10px] uppercase tracking-widest text-neutral-700 focus:border-black focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === "all" ? "All" : opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg tabular-nums">{value}</div>
      {sub && (
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {sub}
        </div>
      )}
    </div>
  );
}
