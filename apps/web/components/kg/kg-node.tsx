"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { KIND_LABEL, type KgNode, type KgNodeKind } from "./types";

const SHAPE: Record<KgNodeKind, string> = {
  gang: "border-2 border-black bg-white",
  member: "border-black bg-white",
  territory: "border border-dashed border-black bg-white",
  arrest: "border border-neutral-500 bg-neutral-50 line-through decoration-neutral-400 decoration-1",
  alert:
    "border-2 border-black bg-black text-white shadow-[0_0_0_4px_rgba(0,0,0,0.08)]",
  incident: "border-black bg-white",
  pattern: "border-black bg-white rounded-full px-3",
  baseline: "border-neutral-300 bg-neutral-50",
  location: "border-neutral-500 bg-white",
  decision: "border-black bg-black text-white",
  dispatch: "border border-neutral-300 border-l-4 border-l-black bg-white",
};

export interface KgNodeData {
  node: KgNode;
  state: "default" | "focused" | "dimmed" | "highlighted";
  isMatch?: boolean;
}

export function KgFlowNode({ data, selected }: NodeProps) {
  const { node, state, isMatch } = data as unknown as KgNodeData;
  const isDimmed = state === "dimmed";
  const isHighlighted = state === "highlighted" || state === "focused";

  return (
    <div
      className={cn(
        "relative flex min-w-[150px] max-w-[220px] flex-col gap-0.5 border px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all duration-200",
        SHAPE[node.kind],
        selected && "shadow-[0_0_0_2px_black]",
        state === "focused" && "shadow-[0_0_0_2px_black]",
        isDimmed && "opacity-25",
        isMatch && "shadow-[0_0_0_2px_#000]",
      )}
      style={
        isHighlighted
          ? { boxShadow: "0 0 0 1px #000, 0 0 12px rgba(0,0,0,0.25)" }
          : undefined
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1 !w-1 !bg-neutral-300"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8px] tracking-widest text-neutral-400">
          {KIND_LABEL[node.kind]}
        </span>
        {node.source === "live" && (
          <span
            aria-label="Live"
            className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest text-neutral-500"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            Live
          </span>
        )}
      </div>
      <span className="truncate text-[11px] normal-case tracking-normal">
        {node.label}
      </span>
      {node.sub && (
        <span className="truncate text-[9px] normal-case text-neutral-500">
          {node.sub}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1 !w-1 !bg-neutral-300"
      />
    </div>
  );
}
