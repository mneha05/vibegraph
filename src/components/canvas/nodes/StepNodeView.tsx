"use client";
import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { clsx } from "clsx";
import {
  CircleDot,
  CheckCircle2,
  AlertOctagon,
  TriangleAlert,
  X,
  ArrowUp,
  ArrowDown,
  Flag,
} from "lucide-react";
import { useVibeStore } from "@/lib/store/vibeStore";
import type { StepNode, ImportNode } from "@/lib/vibe/schema";
import type { StepRole } from "@/lib/vibe/classification";

interface NodeData {
  node: StepNode | ImportNode;
  label: string;
  role?: StepRole;
  selected?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  issueSeverity?: string;
  executionState?: "pending" | "running" | "visited";
}

/**
 * StepNodeView — the workhorse node renderer.
 *
 * Visual conventions:
 *   - amber border        → entry point / start node
 *   - sage border + check → conclusion (concludeWorkflow / *_done)
 *   - amber + warn icon   → error handler
 *   - rose border         → terminating error
 *   - cyan accent         → normal step
 *
 * Hover (when editing is unlocked) reveals inline actions:
 *   - top-right ×         → delete the step
 *   - top-right ⚠         → add an error handler (if none exists)
 *   - top ↑               → insert step before
 *   - bottom ↓            → insert step after
 *
 * Handles on top/bottom let you drag-to-connect; React Flow's onConnect
 * callback (wired in CanvasPane) calls the store's `addEdge` action.
 */
export function StepNodeView({ data }: { data: NodeData }) {
  const { node, label, role = "normal", selected, dimmed, highlighted, issueSeverity, executionState } = data;
  const [hovered, setHovered] = useState(false);
  const editLocked = useVibeStore((s) => s.editLocked);
  const deleteNode = useVibeStore((s) => s.deleteNode);
  const insertBefore = useVibeStore((s) => s.insertStepBefore);
  const insertAfter = useVibeStore((s) => s.insertStepAfter);
  const addErrorHandler = useVibeStore((s) => s.addErrorHandlerFor);

  const isImport = node.kind === "import";
  const stepFn = node.kind === "step" ? node.function : undefined;
  const description = (node as { description?: string }).description;
  const showActions = hovered && !editLocked;
  const isError = issueSeverity?.includes("error");
  const isWarning = issueSeverity?.includes("warning");
  const palette = paletteFor(role, { selected, isError, isWarning });

  const isRunning = executionState === "running";
  const isVisited = executionState === "visited";
  const isPending = executionState === "pending";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={clsx(
        "relative w-[220px] rounded-md border bg-ink-700 transition-all",
        "shadow-[0_1px_0_rgba(255,255,255,0.04),0_6px_18px_rgba(0,0,0,0.35)]",
        "border-l-4",
        palette.border,
        palette.borderLeft,
        dimmed && !highlighted && "opacity-30",
        highlighted && "ring-1 ring-cyan/60",
        isRunning && "!border-amber ring-2 ring-amber/80 animate-pulse-glow",
        isPending && "opacity-40",
      )}
    >
      {isVisited && (
        <div
          className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-sage flex items-center justify-center text-ink-900 z-10"
          title="Visited in simulation"
        >
          <CheckCircle2 size={11} />
        </div>
      )}
      {isRunning && (
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber animate-ping" />
      )}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !border-2 !border-ink-600 !bg-ink-800"
      />

      <div className="px-3 pt-2 pb-1 flex items-center gap-2">
        {role === "start" && <Flag size={11} className="text-amber" />}
        {role === "conclusion" && <CheckCircle2 size={11} className="text-sage" />}
        {role === "error_handler" && <TriangleAlert size={11} className="text-amber" />}
        {role === "terminating_error" && <AlertOctagon size={11} className="text-rose" />}
        {role === "normal" && !isImport && <CircleDot size={11} className="text-ink-300" />}
        <span
          className={clsx(
            "text-[10px] uppercase tracking-[0.14em] font-mono",
            palette.labelText,
          )}
        >
          {isImport ? "import" : roleLabel(role)}
        </span>
      </div>

      <div className="px-3 pb-2">
        <div className="font-mono text-[13px] text-ink-50 truncate" title={label}>
          {label}
        </div>
        {stepFn && (
          <div className="mt-0.5 font-mono text-[11px] text-amber-soft truncate">
            {stepFn}
          </div>
        )}
        {isImport && (
          <div className="mt-0.5 font-mono text-[11px] text-cyan-soft truncate">
            ↳ {(node as ImportNode).source}
          </div>
        )}
        {description && (
          <div className="mt-1 text-[10.5px] text-ink-300 leading-snug line-clamp-2">
            {description}
          </div>
        )}
      </div>

      {showActions && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(node.id);
            }}
            className="nodrag absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-rose/15 border border-rose text-rose flex items-center justify-center hover:bg-rose hover:text-ink-900 transition-colors z-10"
            title="Delete step"
          >
            <X size={11} />
          </button>
          {node.kind === "step" && !node.on_error_step_id && role !== "error_handler" && role !== "terminating_error" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                addErrorHandler(node.id);
              }}
              className="nodrag absolute -top-2.5 right-4 w-5 h-5 rounded-full bg-amber/15 border border-amber text-amber flex items-center justify-center hover:bg-amber hover:text-ink-900 transition-colors z-10"
              title="Add error handler"
            >
              <TriangleAlert size={10} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              insertBefore(node.id);
            }}
            className="nodrag absolute -top-2.5 left-3 w-5 h-5 rounded-full bg-ink-800 border border-ink-500 text-ink-100 flex items-center justify-center hover:text-amber hover:border-amber transition-colors z-10"
            title="Insert step before"
          >
            <ArrowUp size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              insertAfter(node.id);
            }}
            className="nodrag absolute -bottom-2.5 left-3 w-5 h-5 rounded-full bg-ink-800 border border-ink-500 text-ink-100 flex items-center justify-center hover:text-amber hover:border-amber transition-colors z-10"
            title="Insert step after"
          >
            <ArrowDown size={11} />
          </button>
        </>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !border-2 !border-ink-600 !bg-ink-800"
      />
    </div>
  );
}

function roleLabel(role: StepRole): string {
  switch (role) {
    case "start":
      return "start";
    case "conclusion":
      return "conclusion";
    case "error_handler":
      return "error handler";
    case "terminating_error":
      return "terminating";
    default:
      return "step";
  }
}

function paletteFor(
  role: StepRole,
  state: { selected?: boolean; isError?: boolean; isWarning?: boolean },
) {
  if (state.isError) {
    return {
      border: "border-rose",
      borderLeft: "border-l-rose",
      labelText: "text-rose",
    };
  }
  if (state.isWarning) {
    return {
      border: state.selected ? "border-amber" : "border-amber/60",
      borderLeft: "border-l-amber",
      labelText: "text-amber",
    };
  }
  if (state.selected) {
    return {
      border: "border-amber",
      borderLeft: "border-l-amber",
      labelText: "text-amber",
    };
  }
  switch (role) {
    case "start":
      return {
        border: "border-amber/60",
        borderLeft: "border-l-amber",
        labelText: "text-amber",
      };
    case "conclusion":
      return {
        border: "border-sage/60",
        borderLeft: "border-l-sage",
        labelText: "text-sage",
      };
    case "error_handler":
      return {
        border: "border-amber/40",
        borderLeft: "border-l-amber",
        labelText: "text-amber-soft",
      };
    case "terminating_error":
      return {
        border: "border-rose/60",
        borderLeft: "border-l-rose",
        labelText: "text-rose",
      };
    default:
      return {
        border: "border-ink-500",
        borderLeft: "border-l-cyan",
        labelText: "text-ink-300",
      };
  }
}
