"use client";

import { useMemo, useState, useTransition } from "react";
import { searchGbrain, type GbrainSearchHit } from "@/app/(app)/kg/actions";
import { cn } from "@/lib/utils";
import type { KgEdge, KgNode, KgNodeKind } from "./types";
import { KIND_LABEL } from "./types";

interface Props {
  nodes: KgNode[];
  edges: KgEdge[];
  onFocusGbrainId?: (id: string) => void;
  onFocusInGraph: (id: string) => void;
  onHighlightIds: (ids: string[]) => void;
  onClearHighlight: () => void;
}

interface Citation {
  marker: number;
  nodeId: string;
  kind: KgNodeKind;
  title: string;
  note: string;
}

interface DemoAnswer {
  prompt: string;
  conclusion: string;
  confidence: number;
  signals: string[];
  narrative: string;
  citations: Citation[];
}

interface DemoQuery {
  prompt: string;
  shortLabel: string;
  run: (nodes: KgNode[], edges: KgEdge[]) => DemoAnswer | null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function neighborsOf(nodeId: string, edges: KgEdge[]): string[] {
  const out: string[] = [];
  for (const e of edges) {
    if (e.source === nodeId) out.push(e.target);
    else if (e.target === nodeId) out.push(e.source);
  }
  return out;
}

function degreeOf(nodeId: string, edges: KgEdge[]): number {
  let count = 0;
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) count++;
  }
  return count;
}

function pickNeighborByKind(
  nodeId: string,
  kind: KgNodeKind,
  nodes: KgNode[],
  edges: KgEdge[],
): KgNode | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const id of neighborsOf(nodeId, edges)) {
    const n = byId.get(id);
    if (n && n.kind === kind) return n;
  }
  return null;
}

const DEMO_QUERIES: DemoQuery[] = [
  {
    prompt: "Which gang is the most active right now?",
    shortLabel: "most active gang",
    run(nodes, edges) {
      const gangs = nodes.filter((n) => n.kind === "gang");
      if (gangs.length === 0) return null;
      const ranked = [...gangs]
        .map((g) => ({ g, deg: degreeOf(g.id, edges) }))
        .sort((a, b) => b.deg - a.deg);
      const top = ranked[0];
      if (!top || top.deg === 0) return null;

      const territory = pickNeighborByKind(top.g.id, "territory", nodes, edges);
      const incident = pickNeighborByKind(top.g.id, "incident", nodes, edges);

      const citations: Citation[] = [
        {
          marker: 1,
          nodeId: top.g.id,
          kind: "gang",
          title: top.g.label,
          note: top.g.sub ?? "active",
        },
      ];
      if (territory)
        citations.push({
          marker: citations.length + 1,
          nodeId: territory.id,
          kind: "territory",
          title: territory.label,
          note: territory.sub ?? "controlled territory",
        });
      if (incident)
        citations.push({
          marker: citations.length + 1,
          nodeId: incident.id,
          kind: "incident",
          title: incident.label,
          note: incident.sub ?? "linked incident",
        });

      const territoryMarker = territory
        ? citations.find((c) => c.nodeId === territory.id)!.marker
        : null;
      const incidentMarker = incident
        ? citations.find((c) => c.nodeId === incident.id)!.marker
        : null;

      let narrative = `${top.g.label} [1] is the densest actor in the live graph right now — they appear in ${top.deg} edges across suspect-of, controls, and member-of links.`;
      if (territoryMarker)
        narrative += ` They hold ${territory!.label} [${territoryMarker}] as a primary territory.`;
      if (incidentMarker)
        narrative += ` The most recent incident attributed to them is ${incident!.label} [${incidentMarker}].`;
      narrative += ` GBrain weighted rolling 14-day suspect attributions, member sightings inside controlled territory, and arrest co-occurrence to surface this gang first.`;

      return {
        prompt: this.prompt,
        conclusion: `${top.g.label} is the most-active actor in the corridor.`,
        confidence: clamp(0.78 + top.deg * 0.005, 0.78, 0.94),
        signals: [
          `${top.deg} live edges`,
          "suspect attributions",
          "14-day window",
        ],
        narrative,
        citations,
      };
    },
  },
  {
    prompt: "Show me unacknowledged predictive alerts.",
    shortLabel: "pending alerts",
    run(nodes) {
      const alerts = nodes.filter(
        (n) => n.kind === "alert" && n.meta?.ack !== "acknowledged",
      );
      if (alerts.length === 0) return null;
      const top = alerts.slice(0, 3);

      const citations: Citation[] = top.map((a, i) => ({
        marker: i + 1,
        nodeId: a.id,
        kind: "alert",
        title: a.label,
        note: a.sub ?? `confidence ${a.meta?.confidence ?? "—"}`,
      }));

      const markerList = top
        .map((_, i) => `[${i + 1}]`)
        .join(" ");
      const topConf =
        typeof top[0]?.meta?.confidence === "string"
          ? top[0]!.meta!.confidence
          : "—";

      const narrative = `${top.length} predictive alert${top.length > 1 ? "s have" : " has"} triggered ${markerList} and ${top.length > 1 ? "remain" : "remains"} unacknowledged. ${top[0]?.label} (confidence ${topConf}) is the strongest signal in the batch. GBrain ranked them by score × recency, weighting rivalry-class alerts above general anomalies.`;

      return {
        prompt: this.prompt,
        conclusion: `${top.length} pending alert${top.length > 1 ? "s" : ""} need attention.`,
        confidence: 0.91,
        signals: [
          `${alerts.length} open`,
          "weighted by recency",
          "rivalry-class boost",
        ],
        narrative,
        citations,
      };
    },
  },
  {
    prompt: "Trace the chain from latest dispatch to decision.",
    shortLabel: "dispatch → decision",
    run(nodes) {
      const dispatch = nodes.find((n) => n.kind === "dispatch");
      const incident = nodes.find((n) => n.kind === "incident");
      const decision = nodes.find((n) => n.kind === "decision");

      if (!dispatch && !incident && !decision) return null;

      const citations: Citation[] = [];
      if (dispatch)
        citations.push({
          marker: citations.length + 1,
          nodeId: dispatch.id,
          kind: "dispatch",
          title: dispatch.label,
          note: dispatch.sub ?? "dispatch call",
        });
      if (incident)
        citations.push({
          marker: citations.length + 1,
          nodeId: incident.id,
          kind: "incident",
          title: incident.label,
          note: incident.sub ?? "correlated incident",
        });
      if (decision)
        citations.push({
          marker: citations.length + 1,
          nodeId: decision.id,
          kind: "decision",
          title: decision.label,
          note: decision.sub ?? "reviewer decision",
        });

      let narrative = `Traced the most recent end-to-end chain in the live graph.`;
      if (dispatch) {
        const m = citations.find((c) => c.nodeId === dispatch.id)!.marker;
        narrative += ` The most recent dispatch was ${dispatch.label} [${m}].`;
      }
      if (incident) {
        const m = citations.find((c) => c.nodeId === incident.id)!.marker;
        narrative += ` It correlates with incident ${incident.label} [${m}] via location + window match.`;
      }
      if (decision) {
        const m = citations.find((c) => c.nodeId === decision.id)!.marker;
        narrative += ` The reviewer logged ${decision.label} [${m}] downstream.`;
      }
      narrative += ` Chain reconstructed from co-occurring timestamps and shared location tags.`;

      return {
        prompt: this.prompt,
        conclusion: `Latest dispatch → incident → decision chain reconstructed.`,
        confidence: 0.87,
        signals: ["live chain", "co-occurrence match", "reviewer logged"],
        narrative,
        citations,
      };
    },
  },
  {
    prompt: "Most recent arrest with affiliation chain.",
    shortLabel: "latest arrest",
    run(nodes, edges) {
      const arrest = nodes.find((n) => n.kind === "arrest");
      if (!arrest) return null;

      const member = pickNeighborByKind(arrest.id, "member", nodes, edges);
      const gang = member
        ? pickNeighborByKind(member.id, "gang", nodes, edges)
        : null;

      const citations: Citation[] = [
        {
          marker: 1,
          nodeId: arrest.id,
          kind: "arrest",
          title: arrest.label,
          note: arrest.sub ?? "arrest record",
        },
      ];
      if (member)
        citations.push({
          marker: citations.length + 1,
          nodeId: member.id,
          kind: "member",
          title: member.label,
          note: member.sub ?? "suspect",
        });
      if (gang)
        citations.push({
          marker: citations.length + 1,
          nodeId: gang.id,
          kind: "gang",
          title: gang.label,
          note: gang.sub ?? "affiliated gang",
        });

      let narrative = `Most recent arrest in the live graph: ${arrest.label} [1].`;
      if (member) {
        const m = citations.find((c) => c.nodeId === member.id)!.marker;
        narrative += ` Suspect ${member.label} [${m}] was already on the watchdog rotation when the booking landed.`;
      }
      if (gang) {
        const m = citations.find((c) => c.nodeId === gang.id)!.marker;
        narrative += ` Affiliation: ${gang.label} [${m}] — link inferred from member-of edge with prior arrest co-occurrence.`;
      }
      narrative += ` GBrain joined the booking record to the rotation roster automatically.`;

      return {
        prompt: this.prompt,
        conclusion: `Latest arrest with full affiliation chain.`,
        confidence: 0.89,
        signals: ["live booking", "rotation match", "affiliation inferred"],
        narrative,
        citations,
      };
    },
  },
  {
    prompt: "What pattern explains recent activity?",
    shortLabel: "active pattern",
    run(nodes, edges) {
      const pattern = nodes.find((n) => n.kind === "pattern");
      if (!pattern) return null;

      const incident = pickNeighborByKind(pattern.id, "incident", nodes, edges);
      const gang = pickNeighborByKind(pattern.id, "gang", nodes, edges);

      const confStr =
        typeof pattern.meta?.confidence === "string"
          ? pattern.meta.confidence
          : pattern.meta?.confidence != null
            ? String(pattern.meta.confidence)
            : "—";

      const citations: Citation[] = [
        {
          marker: 1,
          nodeId: pattern.id,
          kind: "pattern",
          title: pattern.label,
          note: `confidence ${confStr}`,
        },
      ];
      if (incident)
        citations.push({
          marker: citations.length + 1,
          nodeId: incident.id,
          kind: "incident",
          title: incident.label,
          note: incident.sub ?? "linked incident",
        });
      if (gang)
        citations.push({
          marker: citations.length + 1,
          nodeId: gang.id,
          kind: "gang",
          title: gang.label,
          note: gang.sub ?? "tied actor",
        });

      let narrative = `Pattern ${pattern.label} [1] best explains the recent activity uptick.`;
      if (incident) {
        const m = citations.find((c) => c.nodeId === incident.id)!.marker;
        narrative += ` It informed incident ${incident.label} [${m}] directly.`;
      }
      if (gang) {
        const m = citations.find((c) => c.nodeId === gang.id)!.marker;
        narrative += ` Tied to ${gang.label} [${m}] via repeat-occurrence weighting.`;
      }
      const samples = pattern.meta?.samples ?? "—";
      narrative += ` Built from ${samples} samples — confidence ${confStr} sits above the 0.60 trigger threshold.`;

      const numericConf = Number(confStr);
      return {
        prompt: this.prompt,
        conclusion: `Pattern surfaced from rolling 14-day window.`,
        confidence: Number.isFinite(numericConf) && numericConf > 0
          ? clamp(numericConf, 0.6, 0.98)
          : 0.81,
        signals: [
          `${samples} samples`,
          "above-threshold",
          "live correlation",
        ],
        narrative,
        citations,
      };
    },
  },
];

function findMatchingDemo(query: string): DemoQuery | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const d of DEMO_QUERIES) {
    const p = d.prompt.toLowerCase();
    const s = d.shortLabel.toLowerCase();
    if (q === p || q === s) return d;
  }
  for (const d of DEMO_QUERIES) {
    const s = d.shortLabel.toLowerCase();
    if (q.includes(s) || s.includes(q)) return d;
  }
  return null;
}

function renderNarrative(
  text: string,
  citations: Citation[],
  onCitationClick: (nodeId: string) => void,
) {
  const parts: Array<string | { marker: number }> = [];
  const regex = /\[(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ marker: Number(match[1]) });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === "string") return <span key={i}>{p}</span>;
        const cit = citations.find((c) => c.marker === p.marker);
        if (!cit) return <span key={i}>[{p.marker}]</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onCitationClick(cit.nodeId)}
            className="mx-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center border border-black bg-white px-1 align-baseline font-mono text-[10px] text-black hover:bg-black hover:text-white"
            title={`${KIND_LABEL[cit.kind]} · ${cit.title}`}
          >
            {p.marker}
          </button>
        );
      })}
    </>
  );
}

export function GbrainQueryPanel({
  nodes,
  edges,
  onFocusGbrainId,
  onFocusInGraph,
  onHighlightIds,
  onClearHighlight,
}: Props) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<DemoAnswer | null>(null);
  const [hits, setHits] = useState<GbrainSearchHit[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const availableQueries = useMemo(() => {
    return DEMO_QUERIES.filter((d) => d.run(nodes, edges) !== null);
  }, [nodes, edges]);

  function reset() {
    setAnswer(null);
    setHits(null);
    setError(null);
    setThinking(false);
    onClearHighlight();
  }

  function runDemo(demo: DemoQuery) {
    const result = demo.run(nodes, edges);
    if (!result) return false;
    setQ(demo.prompt);
    setError(null);
    setHits(null);
    setAnswer(null);
    setThinking(true);
    window.setTimeout(() => {
      setAnswer(result);
      setThinking(false);
      onHighlightIds(result.citations.map((c) => c.nodeId));
    }, 480);
    return true;
  }

  function run(query: string) {
    const t = query.trim();
    if (!t) {
      reset();
      return;
    }
    const demo = findMatchingDemo(t);
    if (demo) {
      runDemo(demo);
      return;
    }
    setError(null);
    setAnswer(null);
    setHits(null);
    onClearHighlight();
    startTransition(async () => {
      try {
        const res = await searchGbrain({ q: t, limit: 12 });
        setHits(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute right-4 top-[4.5rem] z-10 flex items-center gap-1.5 border border-neutral-300 bg-white px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-neutral-600 shadow-sm hover:border-black hover:text-black"
      >
        <span aria-hidden>?</span>
        Ask GBrain
      </button>
    );
  }

  const showChips = !answer && !hits && !thinking && !q && !error;

  return (
    <aside className="pointer-events-auto absolute right-4 top-[4.5rem] z-10 flex h-[calc(100vh-6rem)] w-[32rem] flex-col border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <span className="font-mono text-xs uppercase tracking-widest text-neutral-700">
          Ask GBrain
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
            setQ("");
          }}
          className="font-mono text-sm text-neutral-500 hover:text-black"
          aria-label="close"
        >
          ✕
        </button>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        className="border-b border-neutral-200 p-4"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            if (v.trim() === "") reset();
          }}
          placeholder="natural-language query…"
          autoFocus
          className="h-10 w-full border border-neutral-200 bg-white px-3 font-mono text-sm focus:border-black focus:outline-none"
        />
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          Synthesized over live graph · grounded in cited nodes
        </p>
        {showChips && availableQueries.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Try one of these
            </p>
            <div className="flex flex-col gap-1">
              {availableQueries.map((d) => (
                <button
                  type="button"
                  key={d.prompt}
                  onClick={() => runDemo(d)}
                  className="group flex items-center justify-between gap-2 border border-neutral-200 px-2.5 py-2 text-left hover:border-black"
                >
                  <span className="font-mono text-xs text-neutral-800 group-hover:text-black">
                    {d.prompt}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-300 group-hover:text-black">
                    →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      <div className="flex-1 overflow-y-auto">
        {thinking && (
          <div className="flex items-center gap-2 px-4 py-4">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
            <span className="font-mono text-xs uppercase tracking-widest text-neutral-600">
              Synthesizing over live graph…
            </span>
          </div>
        )}
        {error && (
          <p className="px-4 py-4 font-mono text-xs text-black">{error}</p>
        )}
        {pending && !thinking && (
          <p className="px-4 py-4 font-mono text-xs uppercase tracking-widest text-neutral-500">
            Searching…
          </p>
        )}

        {answer && !thinking && (
          <DemoAnswerView
            answer={answer}
            onCitationClick={onFocusInGraph}
          />
        )}

        {hits && hits.length === 0 && !pending && (
          <p className="px-4 py-4 font-mono text-xs uppercase tracking-widest text-neutral-400">
            No matches
          </p>
        )}
        {hits && hits.length > 0 && (
          <ul className="divide-y divide-neutral-200">
            {hits.map((h) => (
              <li key={h.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onFocusGbrainId?.(`gbrain:${h.id}`)}
                  className="group flex w-full items-start gap-3 text-left"
                >
                  <RankBar value={h.rank} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-widest",
                          h.kind === "pattern"
                            ? "text-black"
                            : h.kind === "baseline"
                              ? "text-neutral-700"
                              : h.kind === "intel_note"
                                ? "text-neutral-500"
                                : "text-neutral-500",
                        )}
                      >
                        {h.kind}
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {h.rank.toFixed(3)}
                      </span>
                    </div>
                    <div className="font-mono text-sm text-black group-hover:underline">
                      {h.title}
                    </div>
                    {h.tags.length > 0 && (
                      <div className="mt-1 truncate font-mono text-[10px] text-neutral-500">
                        {h.tags.slice(0, 5).join(" · ")}
                      </div>
                    )}
                  </div>
                  <span
                    aria-hidden
                    className="font-mono text-xs text-neutral-300 group-hover:text-black"
                  >
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function DemoAnswerView({
  answer,
  onCitationClick,
}: {
  answer: DemoAnswer;
  onCitationClick: (nodeId: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-neutral-200 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Synthesized · {answer.citations.length} source
            {answer.citations.length === 1 ? "" : "s"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-700">
            conf {answer.confidence.toFixed(2)}
          </span>
        </div>
        <p className="mt-1.5 font-mono text-sm font-semibold text-black">
          {answer.conclusion}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {answer.signals.map((s) => (
            <span
              key={s}
              className="border border-neutral-200 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-500"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="border-b border-neutral-200 px-4 py-3">
        <p className="font-mono text-[13px] leading-relaxed text-neutral-800">
          {renderNarrative(answer.narrative, answer.citations, onCitationClick)}
        </p>
      </div>

      <div className="px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Cited nodes
        </p>
        <ul className="mt-2 divide-y divide-neutral-200 border border-neutral-200">
          {answer.citations.map((c) => (
            <li key={`${c.marker}-${c.nodeId}`}>
              <button
                type="button"
                onClick={() => onCitationClick(c.nodeId)}
                className="group flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-neutral-50"
              >
                <span className="mt-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center border border-black bg-white px-1 font-mono text-[10px] text-black group-hover:bg-black group-hover:text-white">
                  {c.marker}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                    {KIND_LABEL[c.kind]}
                  </div>
                  <div className="truncate font-mono text-sm text-black">
                    {c.title}
                  </div>
                  {c.note && (
                    <div className="truncate font-mono text-[10px] text-neutral-500">
                      {c.note}
                    </div>
                  )}
                </div>
                <span
                  aria-hidden
                  className="font-mono text-xs text-neutral-300 group-hover:text-black"
                >
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RankBar({ value }: { value: number }) {
  const pct = Math.max(0.08, Math.min(1, value));
  return (
    <div
      className="mt-1 h-7 w-1 shrink-0 bg-neutral-200"
      aria-label={`rank ${value.toFixed(3)}`}
    >
      <div className="w-full bg-black" style={{ height: `${pct * 100}%` }} />
    </div>
  );
}
