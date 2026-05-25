"use client";
import { Handle, Position } from "@xyflow/react";
import { clsx } from "clsx";
import { Import as ImportIcon } from "lucide-react";
import type { ImportNode } from "@/lib/vibe/schema";

interface NodeData {
  node: ImportNode;
  selected?: boolean;
  dimmed?: boolean;
  issueSeverity?: string;
}

export function ImportNodeView({ data }: { data: NodeData }) {
  const { node, selected, dimmed, issueSeverity } = data;
  return (
    <div
      className={clsx(
        "relative min-w-[200px] max-w-[260px] rounded-md border bg-ink-700 transition-all",
        "shadow-[0_1px_0_rgba(255,255,255,0.04),0_6px_18px_rgba(0,0,0,0.35)]",
        "border-l-4",
        selected ? "border-amber border-l-amber" : "border-ink-500 border-l-cyan",
        issueSeverity?.includes("error") && !selected && "border-rose/70 border-l-rose",
        dimmed && "opacity-30",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyan" />
      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
        <ImportIcon size={11} className="text-cyan" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-mono">
          import
        </span>
      </div>
      <div className="px-3 pb-1 font-mono text-[13px] text-ink-50 truncate">{node.id}</div>
      <div className="mx-3 mb-2 px-2 py-1 rounded-sm bg-ink-800 border border-ink-600 text-[11px] font-mono text-cyan-soft truncate">
        ↳ {node.source}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan" />
    </div>
  );
}
