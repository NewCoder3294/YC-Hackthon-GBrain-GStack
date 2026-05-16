"use client";

import { cn } from "@/lib/utils";
import { KIND_LABEL, type KgNode } from "./types";
import { DecisionPanel } from "./decision-panel";
import { AckButton } from "./ack-button";
import { IntelNotePanel } from "./intel-note-panel";

interface Neighbor {
  node: KgNode;
  direction: "in" | "out";
  edgeLabel?: string | undefined;
}

interface Props {
  node: KgNode;
  neighbors: Neighbor[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  onTrace: () => void;
  tracing: boolean;
}

export function KgInspector({
  node,
  neighbors,
  onClose,
  onNavigate,
  onTrace,
  tracing,
}: Props) {
  const incoming = neighbors.filter((n) => n.direction === "in");
  const outgoing = neighbors.filter((n) => n.direction === "out");

  return (
    <aside className="pointer-events-auto absolute right-4 top-[4.5rem] z-10 flex max-h-[calc(100vh-6rem)] w-80 flex-col border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {KIND_LABEL[node.kind]}
          </span>
          {node.source === "live" && (
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
              Live
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="font-mono text-xs text-neutral-500 hover:text-black"
          aria-label="close"
        >
          ✕
        </button>
      </header>

      <div className="overflow-y-auto">
        <div className="px-3 py-3">
          <p className="font-mono text-sm">{node.label}</p>
          {node.sub && (
            <p className="mt-1 font-mono text-xs text-neutral-500">{node.sub}</p>
          )}
          {node.meta && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              {Object.entries(node.meta).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                    {k}
                  </dt>
                  <dd className="font-mono text-xs">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {node.kind === "incident" && (
          <div className="space-y-3 border-t border-neutral-200 px-3 py-3">
            <button
              type="button"
              onClick={onTrace}
              className={cn(
                "w-full border px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                tracing
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 hover:border-black",
              )}
            >
              {tracing ? "Tracing prior context…" : "Trace prior context"}
            </button>
            <p className="font-mono text-[10px] leading-relaxed text-neutral-500">
              Highlights the patterns + baselines GBrain surfaces when this
              incident lands.
            </p>
            <div className="border-t border-neutral-200 pt-3">
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                Dispatcher decision
              </h3>
              <DecisionPanel incidentId={node.id.replace(/^inc:/, "")} />
            </div>
            <div className="border-t border-neutral-200 pt-3">
              <IntelNotePanel
                relatedIncidentId={node.id.replace(/^inc:/, "")}
              />
            </div>
          </div>
        )}

        {node.kind === "gang" && (
          <div className="border-t border-neutral-200 px-3 py-3">
            <IntelNotePanel relatedGangId={node.id.replace(/^gang:/, "")} />
          </div>
        )}

        {node.kind === "alert" && (
          <div className="border-t border-neutral-200 px-3 py-3">
            <AckButton
              alertId={node.id.replace(/^alert:/, "")}
              alreadyAcked={node.meta?.ack === "acknowledged"}
            />
          </div>
        )}

        {neighbors.length > 0 && (
          <div className="border-t border-neutral-200 px-3 py-3">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Connections ({neighbors.length})
            </h3>
            {outgoing.length > 0 && (
              <NeighborGroup
                title="Out"
                items={outgoing}
                onNavigate={onNavigate}
              />
            )}
            {incoming.length > 0 && (
              <NeighborGroup
                title="In"
                items={incoming}
                onNavigate={onNavigate}
              />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function NeighborGroup({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: Neighbor[];
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="mt-3">
      <h4 className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
        {title}
      </h4>
      <ul className="mt-1 space-y-1">
        {items.map(({ node, edgeLabel }) => (
          <li key={`${title}-${node.id}`}>
            <button
              type="button"
              onClick={() => onNavigate(node.id)}
              className="group flex w-full items-center justify-between gap-2 border border-transparent px-1 py-1 text-left hover:border-neutral-200"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{node.label}</div>
                <div className="truncate font-mono text-[10px] text-neutral-500">
                  {KIND_LABEL[node.kind]}
                  {edgeLabel ? ` · ${edgeLabel}` : ""}
                </div>
              </div>
              <span className="font-mono text-[10px] text-neutral-300 group-hover:text-black">
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { Neighbor };
