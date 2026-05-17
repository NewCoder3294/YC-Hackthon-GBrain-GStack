"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import { KgFlowNode, type KgNodeData } from "./kg-node";
import { buildDetail } from "@/lib/kg/aggregate";
import type { KgNode, KgEdge } from "./types";

const nodeTypes = { kg: KgFlowNode };

interface Props {
  neighborhood: string;
  nodes: KgNode[];
  edges: KgEdge[];
  onSelect: (id: string) => void;
}

function ring(count: number, radius: number, cx = 0, cy = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  });
}

export function NeighborhoodDetail({
  neighborhood,
  nodes,
  edges,
  onSelect,
}: Props) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const { spine, stubs, edges: dEdges } = buildDetail(neighborhood, nodes, edges);
    const spineRing = ring(spine.length, 320);
    const stubRing = ring(stubs.length, 560);

    const rfNodes: Node[] = [
      ...spine.map((node, i) => {
        const data: KgNodeData = { node, state: "default" };
        return {
          id: node.id,
          type: "kg",
          position: spineRing[i] ?? { x: 0, y: 0 },
          data: data as unknown as Record<string, unknown>,
        };
      }),
      ...stubs.map((s, i) => {
        const synthetic: KgNode = {
          id: s.id,
          kind: s.kind,
          label: `+${s.count} ${s.kind}`,
          sub: "click to expand",
        };
        const data: KgNodeData = { node: synthetic, state: "dimmed" };
        return {
          id: s.id,
          type: "kg",
          position: stubRing[i] ?? { x: 0, y: 0 },
          data: data as unknown as Record<string, unknown>,
        };
      }),
    ];

    const rfEdges: Edge[] = dEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: "smoothstep",
      style: { stroke: "#404040", strokeWidth: 1 },
    }));

    return { rfNodes, rfEdges };
  }, [neighborhood, nodes, edges]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      onNodeClick={(_, n) => onSelect(String(n.id))}
      minZoom={0.3}
      maxZoom={2.2}
    >
      <Background color="#ededed" gap={18} size={1} />
      <Controls showInteractive={false} className="!border-neutral-200 !bg-white !shadow-none" />
    </ReactFlow>
  );
}
