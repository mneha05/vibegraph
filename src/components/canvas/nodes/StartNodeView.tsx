"use client";
import { Handle, Position } from "@xyflow/react";
import { Play } from "lucide-react";

interface NodeData {
  label: string;
}

export function StartNodeView({ data }: { data: NodeData }) {
  return (
    <div className="relative min-w-[140px] flex items-center gap-2 px-3 py-2 rounded-full bg-amber text-ink-900 border border-amber-deep shadow-[0_4px_14px_rgba(232,163,61,0.4)]">
      <span className="relative flex items-center justify-center w-5 h-5 rounded-full bg-ink-900/20">
        <Play size={11} className="text-ink-900 fill-ink-900 translate-x-[1px]" />
        <span className="absolute inset-0 rounded-full animate-pulse-ring" />
      </span>
      <span className="font-mono text-[12px] font-semibold truncate">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-deep" />
    </div>
  );
}
