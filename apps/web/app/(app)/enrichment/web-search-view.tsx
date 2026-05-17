"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type Verdict = "corroborate" | "neutral" | "contradict";
export type Severity = "low" | "med" | "high";

export interface WebSearchRow {
  id: number;
  title: string;
  compiledTruth: string;
  createdAt: string;
  url: string | null;
  sourceHost: string | null;
  verdict: Verdict;
  relevance: number | null;
  confidence: number | null;
  reasoning: string | null;
  incidentId: string | null;
  incidentTitle: string | null;
  incidentSeverity: Severity | null;
}

interface Props {
  rows: WebSearchRow[];
}

type SortKey = "recent" | "confidence" | "relevance";
type VerdictFilter = "all" | Verdict;

interface GroupedRow extends WebSearchRow {
  duplicates: number;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function WebSearchView({ rows }: Props) {
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");
  const [hostFilter, setHostFilter] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const hosts = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.sourceHost) set.add(r.sourceHost);
    }
    return Array.from(set).sort();
  }, [rows]);

  const counts = useMemo(() => {
    const c = { corroborate: 0, neutral: 0, contradict: 0 };
    for (const r of rows) c[r.verdict]++;
    return c;
  }, [rows]);

  const incidentsCovered = useMemo(() => {
    return new Set(rows.map((r) => r.incidentId).filter(Boolean)).size;
  }, [rows]);

  const avgConfidence = useMemo(() => {
    const vals = rows.map((r) => r.confidence).filter((v): v is number => typeof v === "number");
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [rows]);

  const lastRun = rows[0]?.createdAt ?? null;

  const filtered = useMemo(() => {
    let out = rows;
    if (verdictFilter !== "all") {
      out = out.filter((r) => r.verdict === verdictFilter);
    }
    if (hostFilter) {
      out = out.filter((r) => r.sourceHost === hostFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.compiledTruth ?? "").toLowerCase().includes(q) ||
          (r.sourceHost ?? "").toLowerCase().includes(q) ||
          (r.incidentTitle ?? "").toLowerCase().includes(q),
      );
    }

    // Dedupe by (url || title) + incidentId — surface most recent + count.
    const byKey = new Map<string, GroupedRow>();
    for (const r of out) {
      const key = `${r.url ?? r.title}|${r.incidentId ?? ""}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...r, duplicates: 0 });
      } else {
        existing.duplicates += 1;
        // Keep newest as canonical
        if (new Date(r.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
          byKey.set(key, { ...r, duplicates: existing.duplicates });
        }
      }
    }
    const grouped = Array.from(byKey.values());

    grouped.sort((a, b) => {
      if (sort === "confidence") {
        return (b.confidence ?? -1) - (a.confidence ?? -1);
      }
      if (sort === "relevance") {
        return (b.relevance ?? -1) - (a.relevance ?? -1);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return grouped;
  }, [rows, verdictFilter, hostFilter, query, sort]);

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filterActive = verdictFilter !== "all" || hostFilter !== "" || query !== "";

  return (
    <>
      <StatsBar
        total={rows.length}
        incidentsCovered={incidentsCovered}
        counts={counts}
        avgConfidence={avgConfidence}
        lastRun={lastRun}
        hostCount={hosts.length}
      />

      <FilterBar
        verdictFilter={verdictFilter}
        onVerdictChange={setVerdictFilter}
        counts={counts}
        total={rows.length}
        hosts={hosts}
        hostFilter={hostFilter}
        onHostChange={setHostFilter}
        sort={sort}
        onSortChange={setSort}
        query={query}
        onQueryChange={setQuery}
        filteredCount={filtered.length}
        filterActive={filterActive}
        onClear={() => {
          setVerdictFilter("all");
          setHostFilter("");
          setQuery("");
        }}
      />

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState filterActive={filterActive} totalRows={rows.length} />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {filtered.map((row) => (
              <ResultRow
                key={row.id}
                row={row}
                expanded={expanded.has(row.id)}
                onToggle={() => toggleExpanded(row.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function StatsBar({
  total,
  incidentsCovered,
  counts,
  avgConfidence,
  lastRun,
  hostCount,
}: {
  total: number;
  incidentsCovered: number;
  counts: { corroborate: number; neutral: number; contradict: number };
  avgConfidence: number | null;
  lastRun: string | null;
  hostCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-px border-b border-neutral-200 bg-neutral-200 lg:grid-cols-5">
      <StatCell label="Enriched results">
        <div className="font-mono text-2xl tabular-nums">{total}</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          across {hostCount} source{hostCount === 1 ? "" : "s"}
        </div>
      </StatCell>

      <StatCell label="Incidents covered">
        <div className="font-mono text-2xl tabular-nums">{incidentsCovered}</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          unique cases
        </div>
      </StatCell>

      <StatCell label="Verdict mix">
        <VerdictMixBar counts={counts} total={total} />
      </StatCell>

      <StatCell label="Avg confidence">
        <ConfidenceMeter value={avgConfidence} />
      </StatCell>

      <StatCell label="Last enrichment">
        <LastRun iso={lastRun} />
      </StatCell>
    </div>
  );
}

function StatCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function VerdictMixBar({
  counts,
  total,
}: {
  counts: { corroborate: number; neutral: number; contradict: number };
  total: number;
}) {
  if (total === 0) {
    return <div className="font-mono text-sm text-neutral-400">—</div>;
  }
  const pct = (n: number) => (n / total) * 100;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden border border-neutral-300">
        {counts.corroborate > 0 && (
          <div
            className="bg-emerald-500"
            style={{ width: `${pct(counts.corroborate)}%` }}
            title={`Corroborate · ${counts.corroborate}`}
          />
        )}
        {counts.neutral > 0 && (
          <div
            className="bg-neutral-200"
            style={{ width: `${pct(counts.neutral)}%` }}
            title={`Neutral · ${counts.neutral}`}
          />
        )}
        {counts.contradict > 0 && (
          <div
            className="bg-rose-500"
            style={{ width: `${pct(counts.contradict)}%` }}
            title={`Contradict · ${counts.contradict}`}
          />
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest">
        <span className="flex items-center gap-1 text-emerald-700">
          <LegendDot color="bg-emerald-500" />
          <span className="tabular-nums">{counts.corroborate}</span>
        </span>
        <span className="flex items-center gap-1 text-neutral-500">
          <LegendDot color="bg-neutral-300" />
          <span className="tabular-nums">{counts.neutral}</span>
        </span>
        <span className="flex items-center gap-1 text-rose-700">
          <LegendDot color="bg-rose-500" />
          <span className="tabular-nums">{counts.contradict}</span>
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className={`inline-block h-1.5 w-1.5 ${color}`} />;
}

function LastRun({ iso }: { iso: string | null }) {
  if (!iso) {
    return (
      <div>
        <div className="font-mono text-sm text-neutral-400">—</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          no runs yet
        </div>
      </div>
    );
  }
  const diff = Date.now() - new Date(iso).getTime();
  const fresh = diff < 5 * 60_000;
  const recent = diff < 60 * 60_000;
  const dotTone = fresh
    ? "bg-amber-400"
    : recent
      ? "bg-emerald-500"
      : "bg-neutral-300";
  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 ${dotTone} ${fresh ? "animate-pulse" : ""}`}
        />
        <span className="font-mono text-sm">{relativeTime(iso)}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        {formatTimestamp(iso)}
      </div>
    </div>
  );
}

function ConfidenceMeter({ value }: { value: number | null }) {
  if (value === null) {
    return <div className="font-mono text-sm text-neutral-400">—</div>;
  }
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const tone =
    value >= 0.66
      ? "bg-emerald-500"
      : value >= 0.33
        ? "bg-amber-400"
        : "bg-rose-500";
  const textTone =
    value >= 0.66
      ? "text-emerald-700"
      : value >= 0.33
        ? "text-amber-700"
        : "text-rose-700";
  return (
    <div>
      <div className={`font-mono text-2xl tabular-nums ${textTone}`}>
        {value.toFixed(2)}
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden border border-neutral-200 bg-white">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FilterBar({
  verdictFilter,
  onVerdictChange,
  counts,
  total,
  hosts,
  hostFilter,
  onHostChange,
  sort,
  onSortChange,
  query,
  onQueryChange,
  filteredCount,
  filterActive,
  onClear,
}: {
  verdictFilter: VerdictFilter;
  onVerdictChange: (v: VerdictFilter) => void;
  counts: { corroborate: number; neutral: number; contradict: number };
  total: number;
  hosts: string[];
  hostFilter: string;
  onHostChange: (h: string) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  query: string;
  onQueryChange: (q: string) => void;
  filteredCount: number;
  filterActive: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5">
        <VerdictChip
          label="All"
          count={total}
          active={verdictFilter === "all"}
          onClick={() => onVerdictChange("all")}
        />
        <VerdictChip
          label="Corroborate"
          count={counts.corroborate}
          active={verdictFilter === "corroborate"}
          accent="emerald"
          onClick={() => onVerdictChange("corroborate")}
        />
        <VerdictChip
          label="Neutral"
          count={counts.neutral}
          active={verdictFilter === "neutral"}
          accent="neutral"
          onClick={() => onVerdictChange("neutral")}
        />
        <VerdictChip
          label="Contradict"
          count={counts.contradict}
          active={verdictFilter === "contradict"}
          accent="rose"
          onClick={() => onVerdictChange("contradict")}
        />
      </div>

      <div className="h-6 w-px bg-neutral-200" />

      <input
        type="text"
        placeholder="search title, source, incident…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="h-7 w-56 border border-neutral-200 bg-white px-2 font-mono text-[11px] outline-none focus:border-black"
      />

      <select
        value={hostFilter}
        onChange={(e) => onHostChange(e.target.value)}
        className="h-7 border border-neutral-200 bg-white px-2 font-mono text-[11px] outline-none focus:border-black"
      >
        <option value="">All sources</option>
        {hosts.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>

      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        className="h-7 border border-neutral-200 bg-white px-2 font-mono text-[11px] outline-none focus:border-black"
      >
        <option value="recent">Sort: most recent</option>
        <option value="confidence">Sort: highest confidence</option>
        <option value="relevance">Sort: highest relevance</option>
      </select>

      {filterActive && (
        <button
          type="button"
          onClick={onClear}
          className="h-7 border border-neutral-200 px-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
        >
          Clear
        </button>
      )}

      <div className="ml-auto font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        showing {filteredCount} of {total}
      </div>
    </div>
  );
}

function VerdictChip({
  label,
  count,
  active,
  accent,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  accent?: "emerald" | "neutral" | "rose";
  onClick: () => void;
}) {
  const dot =
    accent === "emerald"
      ? "bg-emerald-500"
      : accent === "rose"
        ? "bg-rose-500"
        : accent === "neutral"
          ? "bg-neutral-400"
          : "bg-amber-400";
  const base =
    "inline-flex items-center gap-1.5 h-7 border px-2 font-mono text-[10px] uppercase tracking-widest transition-colors";
  const activeStyle =
    accent === "emerald"
      ? "border-emerald-600 bg-emerald-50 text-emerald-900"
      : accent === "rose"
        ? "border-rose-600 bg-rose-50 text-rose-900"
        : accent === "neutral"
          ? "border-neutral-700 bg-neutral-100 text-neutral-900"
          : "border-amber-500 bg-amber-50 text-amber-900";
  const state = active
    ? activeStyle
    : "border-neutral-200 bg-white text-neutral-700 hover:border-black hover:text-black";
  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`}>
      <span className={`inline-block h-1.5 w-1.5 ${dot}`} />
      <span>{label}</span>
      <span
        className={`tabular-nums ${active ? "opacity-60" : "text-neutral-400"}`}
      >
        {count}
      </span>
    </button>
  );
}

function ResultRow({
  row,
  expanded,
  onToggle,
}: {
  row: GroupedRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails = Boolean(row.reasoning) || Boolean(row.compiledTruth);
  return (
    <li className="group bg-white transition-colors hover:bg-neutral-50">
      <div className="flex items-start gap-3 px-4 py-3">
        <VerdictMark verdict={row.verdict} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            <span title={formatTimestamp(row.createdAt)}>
              {relativeTime(row.createdAt)}
            </span>
            {row.sourceHost && (
              <>
                <span>·</span>
                <span className="normal-case tracking-normal text-neutral-500">
                  {row.sourceHost}
                </span>
              </>
            )}
            {row.duplicates > 0 && (
              <>
                <span>·</span>
                <span title="Duplicate enrichments folded into this row">
                  ×{row.duplicates + 1}
                </span>
              </>
            )}
          </div>

          <div className="mt-0.5">
            {row.url ? (
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-black decoration-amber-500 decoration-2 underline-offset-2 hover:text-amber-700 hover:underline"
              >
                {row.title || row.url}
              </a>
            ) : (
              <span className="font-mono text-xs text-black">
                {row.title || "—"}
              </span>
            )}
          </div>

          {row.compiledTruth && (
            <p
              className={`mt-1 font-mono text-[11px] text-neutral-600 ${
                expanded ? "" : "line-clamp-2"
              }`}
            >
              {row.compiledTruth}
            </p>
          )}

          {expanded && row.reasoning && (
            <div className="mt-2 border-l-2 border-neutral-200 pl-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                Agent reasoning
              </div>
              <p className="mt-1 font-mono text-[11px] text-neutral-700">
                {row.reasoning}
              </p>
            </div>
          )}
        </div>

        <div className="hidden w-32 shrink-0 md:block">
          <MetricBar label="Rel." value={row.relevance} />
          <div className="mt-1.5">
            <MetricBar label="Conf." value={row.confidence} />
          </div>
        </div>

        <div className="hidden w-44 shrink-0 lg:block">
          {row.incidentId ? (
            <IncidentChip
              incidentId={row.incidentId}
              title={row.incidentTitle ?? row.incidentId.slice(0, 8)}
              severity={row.incidentSeverity}
            />
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
              no incident
            </span>
          )}
        </div>

        {hasDetails && (
          <button
            type="button"
            onClick={onToggle}
            className="h-6 shrink-0 border border-neutral-200 px-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
            aria-expanded={expanded}
          >
            {expanded ? "Hide" : "Detail"}
          </button>
        )}
      </div>
    </li>
  );
}

function IncidentChip({
  incidentId,
  title,
  severity,
}: {
  incidentId: string;
  title: string;
  severity: Severity | null;
}) {
  const tone =
    severity === "high"
      ? {
          border: "border-rose-500",
          accent: "bg-rose-500",
          label: "text-rose-700",
        }
      : severity === "med"
        ? {
            border: "border-amber-500",
            accent: "bg-amber-400",
            label: "text-amber-700",
          }
        : severity === "low"
          ? {
              border: "border-emerald-500",
              accent: "bg-emerald-500",
              label: "text-emerald-700",
            }
          : {
              border: "border-neutral-200",
              accent: "bg-neutral-300",
              label: "text-neutral-500",
            };
  return (
    <Link
      href={`/incidents/${incidentId}`}
      className={`block border ${tone.border} bg-white px-2 py-1 font-mono text-[10px] text-neutral-700 transition-colors hover:bg-neutral-50`}
      title={title}
    >
      <div className="flex items-center gap-1.5">
        <span className={`inline-block h-1.5 w-1.5 ${tone.accent}`} />
        <span
          className={`font-mono text-[10px] uppercase tracking-widest ${tone.label}`}
        >
          {severity ?? "incident"}
        </span>
      </div>
      <div className="mt-0.5 line-clamp-2 normal-case tracking-normal text-neutral-700">
        {title}
      </div>
    </Link>
  );
}

function VerdictMark({ verdict }: { verdict: Verdict }) {
  const config =
    verdict === "corroborate"
      ? {
          label: "✓",
          className:
            "border-emerald-600 bg-emerald-500 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.15)]",
        }
      : verdict === "contradict"
        ? {
            label: "✗",
            className:
              "border-rose-600 bg-rose-500 text-white shadow-[0_0_0_1px_rgba(244,63,94,0.15)]",
          }
        : {
            label: "·",
            className: "border-neutral-300 bg-white text-neutral-400",
          };
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center border font-mono text-sm font-semibold ${config.className}`}
      title={verdict}
    >
      {config.label}
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number | null }) {
  const hasValue = typeof value === "number";
  const pct = hasValue ? Math.max(0, Math.min(1, value)) * 100 : 0;
  const display = hasValue ? value.toFixed(2) : "—";
  const tone = !hasValue
    ? ""
    : value >= 0.66
      ? "bg-emerald-500"
      : value >= 0.33
        ? "bg-amber-400"
        : "bg-rose-400";
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-700">{display}</span>
      </div>
      <div className="mt-0.5 h-1 w-full overflow-hidden border border-neutral-200 bg-white">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyState({
  filterActive,
  totalRows,
}: {
  filterActive: boolean;
  totalRows: number;
}) {
  if (filterActive && totalRows > 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="max-w-sm text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
            No results match filters
          </p>
          <p className="mt-2 font-mono text-xs text-neutral-300">
            Try clearing filters or widening the verdict selection.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <div className="max-w-sm text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          No web context yet
        </p>
        <p className="mt-2 font-mono text-xs text-neutral-300">
          Click <span className="font-bold">Run enrichment</span> to crawl the
          web for context on recent incidents.
        </p>
      </div>
    </div>
  );
}
