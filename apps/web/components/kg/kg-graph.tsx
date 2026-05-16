"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { KgFlowNode, type KgNodeData } from "./kg-node";
import { KgToolbar } from "./kg-toolbar";
import { KgInspector, type Neighbor } from "./kg-inspector";
import {
  KIND_COLUMN,
  KIND_ORDER,
  type KgEdge,
  type KgNode,
  type KgNodeKind,
} from "./types";

interface Props {
  nodes: KgNode[];
  edges: KgEdge[];
}

const nodeTypes = { kg: KgFlowNode };

function layoutPositions(
  nodes: KgNode[],
): Map<string, { x: number; y: number }> {
  const bucket = new Map<KgNodeKind, KgNode[]>();
  for (const n of nodes) {
    const arr = bucket.get(n.kind) ?? [];
    arr.push(n);
    bucket.set(n.kind, arr);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [kind, arr] of bucket.entries()) {
    const x = KIND_COLUMN[kind] * 280;
    arr.forEach((n, i) => {
      positions.set(n.id, { x, y: i * 110 });
    });
  }
  return positions;
}

function computeNeighborhood(
  nodeId: string,
  edges: KgEdge[],
  depth = 1,
): { nodes: Set<string>; edges: Set<string> } {
  const nodeIds = new Set<string>([nodeId]);
  const edgeIds = new Set<string>();
  let frontier = new Set<string>([nodeId]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (frontier.has(e.source) || frontier.has(e.target)) {
        edgeIds.add(e.id);
        if (!nodeIds.has(e.source)) next.add(e.source);
        if (!nodeIds.has(e.target)) next.add(e.target);
        nodeIds.add(e.source);
        nodeIds.add(e.target);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return { nodes: nodeIds, edges: edgeIds };
}

function computeNeighbors(
  nodeId: string,
  nodes: KgNode[],
  edges: KgEdge[],
): Neighbor[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Neighbor[] = [];
  for (const e of edges) {
    if (e.source === nodeId) {
      const target = byId.get(e.target);
      if (target) out.push({ node: target, direction: "out", edgeLabel: e.label });
    } else if (e.target === nodeId) {
      const source = byId.get(e.source);
      if (source) out.push({ node: source, direction: "in", edgeLabel: e.label });
    }
  }
  return out;
}

function GraphInner({ nodes, edges }: Props) {
  const [query, setQuery] = useState("");
  const [hiddenKinds, setHiddenKinds] = useState<Set<KgNodeKind>>(
    () => new Set(),
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracing, setTracing] = useState(false);
  const traceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlow = useReactFlow();

  const counts = useMemo(() => {
    const out = {
      incident: 0,
      pattern: 0,
      baseline: 0,
      location: 0,
      decision: 0,
    } satisfies Record<KgNodeKind, number>;
    for (const n of nodes) out[n.kind]++;
    return out;
  }, [nodes]);

  const liveCount = useMemo(
    () => nodes.filter((n) => n.source === "live").length,
    [nodes],
  );

  const visibleNodeIds = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const matches = (n: KgNode) => {
      if (!trimmedQuery) return true;
      return (
        n.label.toLowerCase().includes(trimmedQuery) ||
        (n.sub?.toLowerCase().includes(trimmedQuery) ?? false) ||
        n.id.toLowerCase().includes(trimmedQuery)
      );
    };
    const set = new Set<string>();
    for (const n of nodes) {
      if (hiddenKinds.has(n.kind)) continue;
      if (!matches(n)) continue;
      set.add(n.id);
    }
    return set;
  }, [nodes, hiddenKinds, query]);

  const queryMatches = useMemo(() => {
    if (!query.trim()) return new Set<string>();
    return visibleNodeIds;
  }, [query, visibleNodeIds]);

  const focusNeighborhood = useMemo(() => {
    if (!focusedId) return null;
    return computeNeighborhood(focusedId, edges, 2);
  }, [focusedId, edges]);

  const initial = useMemo(() => {
    const positions = layoutPositions(nodes);
    const rfNodes: Node[] = nodes.map((n) => {
      const data: KgNodeData = { node: n, state: "default" };
      return {
        id: n.id,
        type: "kg",
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: data as unknown as Record<string, unknown>,
      };
    });
    const rfEdges: Edge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      labelStyle: { fontFamily: "var(--font-mono)", fontSize: 9, fill: "#737373" },
      labelBgStyle: { fill: "#ffffff" },
      style: { stroke: "#404040", strokeWidth: 1 },
      type: "smoothstep",
    }));
    return { rfNodes, rfEdges };
  }, [nodes, edges]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(initial.rfNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(initial.rfEdges);

  // Reset graph when source data changes
  useEffect(() => {
    setRfNodes(initial.rfNodes);
    setRfEdges(initial.rfEdges);
  }, [initial, setRfNodes, setRfEdges]);

  // Apply filters/focus/trace to node + edge visual state
  useEffect(() => {
    setRfNodes((curr) =>
      curr.map((node) => {
        const baseData = node.data as unknown as KgNodeData;
        const kgNode = baseData.node;
        const hidden =
          hiddenKinds.has(kgNode.kind) || !visibleNodeIds.has(kgNode.id);
        const isFocus = kgNode.id === focusedId;
        const inFocusHood =
          !!focusNeighborhood && focusNeighborhood.nodes.has(kgNode.id);

        let state: KgNodeData["state"] = "default";
        if (isFocus) state = "focused";
        else if (focusNeighborhood) {
          state = inFocusHood ? "highlighted" : "dimmed";
        } else if (query.trim() && !queryMatches.has(kgNode.id)) {
          state = "dimmed";
        }

        const nextData: KgNodeData = {
          node: kgNode,
          state,
          isMatch: queryMatches.has(kgNode.id) && !!query.trim(),
        };

        return {
          ...node,
          hidden,
          data: nextData as unknown as Record<string, unknown>,
        };
      }),
    );

    setRfEdges((curr) =>
      curr.map((edge) => {
        const sourceHidden = !visibleNodeIds.has(edge.source);
        const targetHidden = !visibleNodeIds.has(edge.target);
        const hidden = sourceHidden || targetHidden;

        const inFocusHood =
          !!focusNeighborhood && focusNeighborhood.edges.has(edge.id);
        const inTrace =
          tracing &&
          focusNeighborhood &&
          focusNeighborhood.edges.has(edge.id);

        let stroke = "#404040";
        let opacity = 1;
        let strokeWidth = 1;
        let animated = false;

        if (focusNeighborhood) {
          if (inFocusHood) {
            stroke = "#000000";
            strokeWidth = 1.5;
          } else {
            opacity = 0.15;
          }
        }
        if (inTrace) {
          animated = true;
          strokeWidth = 2;
        }

        return {
          ...edge,
          hidden,
          animated,
          style: { ...edge.style, stroke, opacity, strokeWidth },
        };
      }),
    );
  }, [
    hiddenKinds,
    visibleNodeIds,
    queryMatches,
    query,
    focusedId,
    focusNeighborhood,
    tracing,
    setRfNodes,
    setRfEdges,
  ]);

  const onNodeClick = useCallback(
    (_: unknown, n: Node) => {
      setSelectedId(n.id);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  const toggleKind = useCallback((kind: KgNodeKind) => {
    setHiddenKinds((curr) => {
      const next = new Set(curr);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const focusOnNode = useCallback(
    (id: string, zoom = true) => {
      setFocusedId(id);
      setSelectedId(id);
      if (zoom) {
        const rfNode = reactFlow.getNode(id);
        if (rfNode) {
          reactFlow.fitView({ nodes: [{ id }], padding: 0.4, duration: 400 });
        }
      }
    },
    [reactFlow],
  );

  const clearFocus = useCallback(() => {
    setFocusedId(null);
    setTracing(false);
    if (traceTimerRef.current) {
      clearTimeout(traceTimerRef.current);
      traceTimerRef.current = null;
    }
    reactFlow.fitView({ padding: 0.15, duration: 400 });
  }, [reactFlow]);

  const handleTrace = useCallback(() => {
    if (!selectedId) return;
    setFocusedId(selectedId);
    setTracing(true);
    if (traceTimerRef.current) clearTimeout(traceTimerRef.current);
    traceTimerRef.current = setTimeout(() => setTracing(false), 4000);
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (traceTimerRef.current) clearTimeout(traceTimerRef.current);
    };
  }, []);

  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, nodes],
  );
  const focusedNode = useMemo(
    () => (focusedId ? nodes.find((n) => n.id === focusedId) ?? null : null),
    [focusedId, nodes],
  );
  const neighbors = useMemo(
    () => (selectedId ? computeNeighbors(selectedId, nodes, edges) : []),
    [selectedId, nodes, edges],
  );

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDoubleClick={(_, n) => focusOnNode(n.id)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#737373" gap={20} size={1.5} />
        <Controls
          showInteractive={false}
          className="!border-neutral-200 !bg-white !shadow-none"
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const data = n.data as unknown as KgNodeData | undefined;
            if (!data) return "#d4d4d4";
            return data.node.kind === "decision" ? "#000" : "#737373";
          }}
          maskColor="rgba(0,0,0,0.04)"
          className="!border !border-neutral-200 !bg-white"
        />
      </ReactFlow>

      <KgToolbar
        query={query}
        onQuery={setQuery}
        hiddenKinds={hiddenKinds}
        onToggleKind={toggleKind}
        counts={counts}
        focusedNodeLabel={focusedNode?.label}
        onClearFocus={clearFocus}
        liveCount={liveCount}
      />

      {selectedNode && (
        <KgInspector
          node={selectedNode}
          neighbors={neighbors}
          onClose={() => setSelectedId(null)}
          onNavigate={(id) => focusOnNode(id)}
          onTrace={handleTrace}
          tracing={tracing}
        />
      )}

      {KIND_ORDER.length === 0 && null}
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
