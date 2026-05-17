"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import { SF_HOTSPOTS } from "@/lib/dispatch-hotspots";
import { projectToViewport } from "@/lib/kg/neighborhoods";
import { buildOverview } from "@/lib/kg/aggregate";
import type { KgNode, KgEdge } from "./types";

const VIEW = { width: 1200, height: 820, padding: 90 };

interface Props {
  nodes: KgNode[];
  edges: KgEdge[];
  onOpenNeighborhood: (neighborhood: string) => void;
}

// NOTE: nodes are click/drill only. Keyboard-accessible drill-in (custom
// node type with role=button/onKeyDown) is a tracked follow-up — the whole
// KG currently relies on React Flow default interaction; out of scope here.
export function OverviewMap({ nodes, edges, onOpenNeighborhood }: Props) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const { clusters, clusterEdges } = buildOverview(nodes, edges);
    const hotspotByName = new Map(SF_HOTSPOTS.map((h) => [h.name, h]));
    const pos = new Map<string, { x: number; y: number }>();

    const mappedNodes: Node[] = clusters.map((c, idx) => {
      const h = hotspotByName.get(c.neighborhood);
      const p = h
        ? projectToViewport(h.lat, h.lng, VIEW)
        : { x: 60, y: 60 + idx * 70 }; // Unmapped/unknown clusters (rare) stack top-left
      pos.set(c.neighborhood, p);
      const size = Math.min(64, 26 + c.incidentCount * 1.5);
      return {
        id: `nb:${c.neighborhood}`,
        position: p,
        data: { label: c.neighborhood },
        type: "default",
        draggable: false,
        style: {
          width: size,
          height: size,
          borderRadius: 999,
          border: `${1 + Math.min(4, c.maxSeverity === 0 ? 0 : c.maxSeverity)}px solid #000`,
          background: "#fff",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
        },
      };
    });

    const mappedEdges: Edge[] = clusterEdges
      .filter((e) => pos.has(e.from) && pos.has(e.to))
      .map((e) => ({
        id: e.id,
        source: `nb:${e.from}`,
        target: `nb:${e.to}`,
        type: "default",
        style: { stroke: "#737373", strokeWidth: Math.min(4, e.weight) },
      }));

    return { rfNodes: mappedNodes, rfEdges: mappedEdges };
  }, [nodes, edges]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      nodesDraggable={false}
      onNodeClick={(_, n) =>
        onOpenNeighborhood(n.id.replace(/^nb:/, ""))
      }
      minZoom={0.4}
      maxZoom={2}
    >
      <Background color="#e5e5e5" gap={22} size={1} />
      <Controls showInteractive={false} className="!border-neutral-200 !bg-white !shadow-none" />
    </ReactFlow>
  );
}
