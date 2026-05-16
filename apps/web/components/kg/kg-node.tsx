"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { type KgNode, type KgNodeKind } from "./types";

// Pill / circle shapes. Per-kind variant communicates type at a glance
// (filled/outline, dashed, double border, line-through). Mono only.
const SHAPE: Record<KgNodeKind, string> = {
  gang: "border-[2.5px] border-black bg-white font-semibold text-[12px] px-4 py-2",
  member: "border border-neutral-700 bg-white",
  territory: "border border-dashed border-black bg-white",
  arrest:
    "border border-neutral-500 bg-neutral-50 line-through decoration-neutral-400 text-neutral-600",
  event: "border border-neutral-400 bg-white",
  alert:
    "border-[2.5px] border-black bg-black text-white font-semibold shadow-[0_0_0_4px_rgba(0,0,0,0.08)]",
  incident: "border border-black bg-white",
  pattern: "border border-black bg-white",
  baseline: "border border-dashed border-neutral-500 bg-neutral-50",
  location: "border border-neutral-500 bg-white",
  decision: "border border-black bg-black text-white",
  dispatch: "border border-neutral-300 border-l-[3px] border-l-black bg-white",
};

const DOT: Record<KgNodeKind, string> = {
  gang: "bg-black",
  member: "border border-black bg-white",
  territory: "border border-dashed border-black bg-transparent",
  arrest: "bg-neutral-400",
  event: "bg-neutral-700",
  alert: "bg-white",
  incident: "bg-black",
  pattern: "border border-black bg-white",
  baseline: "border border-dashed border-neutral-500 bg-transparent",
  location: "bg-neutral-500",
  decision: "bg-white",
  dispatch: "bg-black",
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
        "relative inline-flex max-w-[260px] items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] leading-none whitespace-nowrap transition-all duration-200",
        SHAPE[node.kind],
        selected && "shadow-[0_0_0_2px_black]",
        isDimmed && "opacity-20",
        isMatch && "shadow-[0_0_0_2px_#000]",
      )}
      style={
        isHighlighted
          ? { boxShadow: "0 0 0 1px #000, 0 0 14px rgba(0,0,0,0.22)" }
          : undefined
      }
      title={node.sub ?? undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1 !w-1 !border-0 !bg-transparent"
      />
      <span
        aria-hidden
        className={cn("h-2 w-2 shrink-0 rounded-full", DOT[node.kind])}
      />
      <span className="truncate">{node.label}</span>
      {node.source === "live" && node.kind !== "alert" && (
        <span
          aria-label="Live"
          className="ml-0.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current opacity-60"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1 !w-1 !border-0 !bg-transparent"
      />
    </div>
  );
}
