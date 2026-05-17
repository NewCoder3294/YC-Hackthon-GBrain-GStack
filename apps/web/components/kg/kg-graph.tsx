"use client";

import { useMemo, useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { OverviewMap } from "./overview-map";
import { NeighborhoodDetail } from "./neighborhood-detail";
import { KgInspector } from "./kg-inspector";
import { GbrainQueryPanel } from "./gbrain-query-panel";
import type { KgEdge, KgNode, KgView } from "./types";

interface Props {
  nodes: KgNode[];
  edges: KgEdge[];
}

function computeNeighbors(nodeId: string, nodes: KgNode[], edges: KgEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: { node: KgNode; direction: "in" | "out"; edgeLabel?: string | undefined }[] = [];
  for (const e of edges) {
    if (e.source === nodeId) {
      const t = byId.get(e.target);
      if (t) out.push({ node: t, direction: "out", edgeLabel: e.label });
    } else if (e.target === nodeId) {
      const s = byId.get(e.source);
      if (s) out.push({ node: s, direction: "in", edgeLabel: e.label });
    }
  }
  return out;
}

function GraphInner({ nodes, edges }: Props) {
  const [view, setView] = useState<KgView>({ mode: "overview" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const openNeighborhood = useCallback((neighborhood: string) => {
    setSelectedId(null);
    setView({ mode: "detail", neighborhood });
  }, []);

  const backToOverview = useCallback(() => {
    setSelectedId(null);
    setView({ mode: "overview" });
  }, []);

  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, nodes],
  );
  const neighbors = useMemo(
    () => (selectedId ? computeNeighbors(selectedId, nodes, edges) : []),
    [selectedId, nodes, edges],
  );

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full">
      {/* Breadcrumb */}
      <div className="pointer-events-auto absolute left-4 top-4 z-10 flex items-center gap-2 border border-neutral-200 bg-white px-3 py-1.5 font-mono text-[11px]">
        <button
          type="button"
          onClick={backToOverview}
          className={
            view.mode === "overview"
              ? "font-semibold"
              : "text-neutral-500 hover:text-black"
          }
        >
          SF
        </button>
        {view.mode === "detail" && (
          <>
            <span className="text-neutral-300">▸</span>
            <span className="font-semibold">{view.neighborhood}</span>
            <button
              type="button"
              onClick={backToOverview}
              className="ml-2 border border-neutral-200 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
            >
              ‹ back
            </button>
          </>
        )}
      </div>

      {view.mode === "overview" ? (
        <OverviewMap
          nodes={nodes}
          edges={edges}
          onOpenNeighborhood={openNeighborhood}
        />
      ) : (
        <NeighborhoodDetail
          neighborhood={view.neighborhood}
          nodes={nodes}
          edges={edges}
          onSelect={setSelectedId}
        />
      )}

      {selectedNode && !selectedNode.id.startsWith("stub:") && (
        <KgInspector
          node={selectedNode}
          neighbors={neighbors}
          onClose={() => setSelectedId(null)}
          onNavigate={(id) => setSelectedId(id)}
          onTrace={() => {}}
          tracing={false}
        />
      )}

      {!selectedNode && (
        <GbrainQueryPanel onFocusGbrainId={(id) => setSelectedId(id)} />
      )}
    </div>
  );
}

export function KgGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}

export type { KgEdge, KgNode };
