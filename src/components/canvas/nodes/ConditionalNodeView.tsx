"use client";
import { Handle, Position } from "@xyflow/react";
import { clsx } from "clsx";
import { GitFork } from "lucide-react";
import type { IfNode } from "@/lib/vibe/schema";

interface NodeData {
  node: IfNode;
  selected?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  issueSeverity?: string;
}

export function ConditionalNodeView({ data }: { data: NodeData }) {
  const { node, selected, dimmed, highlighted, issueSeverity } = data;
  const isError = issueSeverity?.includes("error");
  return (
    <div
      className={clsx(
        "relative w-[220px] rounded-md border bg-ink-700 transition-all border-l-4 border-l-cyan",
        "shadow-[0_1px_0_rgba(255,255,255,0.04),0_6px_18px_rgba(0,0,0,0.35)]",
        isError ? "border-rose" : selected ? "border-cyan" : "border-cyan/40",
        dimmed && !highlighted && "opacity-30",
        highlighted && "ring-1 ring-cyan/60",
      )}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !border-2 !border-ink-600 !bg-ink-800" />
      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
        <GitFork size={11} className="text-cyan" />
        <span className="text-[10px] uppercase tracking-[0.14em] font-mono text-cyan">if</span>
      </div>
      <div className="px-3 pb-2">
        <div className="font-mono text-[13px] text-ink-50 truncate">{node.id}</div>
        <div className="mt-0.5 font-mono text-[11px] text-cyan-soft truncate" title={node.condition}>
          {node.condition}
        </div>
        <div className="mt-1 text-[10px] text-ink-300 font-mono">
          {node.then.length} then · {node.else?.length ?? 0} else
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !border-2 !border-ink-600 !bg-ink-800" />
    </div>
  );
}
