"use client";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

/**
 * FlowEdge — the default success-path edge. Color and dash pattern vary per
 * the edge's semantic `kind` so the canvas reads at a glance:
 *   - flow / next / fall_through  → solid amber
 *   - branch_then                  → solid cyan
 *   - branch_else                  → dotted cyan
 *   - loop_iter / loop_back        → solid warm amber, slightly thicker
 *   - parallel_fork                → solid sage
 */
export function FlowEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    borderRadius: 8,
  });
  const kind = (props.data as { kind?: string } | undefined)?.kind ?? "next";
  const { stroke, dash, width } = styleForKind(kind);

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{ stroke, strokeWidth: width, strokeDasharray: dash }}
        markerEnd={props.markerEnd}
      />
      {props.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="absolute pointer-events-none px-1.5 py-0.5 rounded-sm bg-ink-800 border border-ink-600 text-[10px] font-mono text-ink-100"
          >
            {props.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** Dashed warning edge for `on_error_step_id` jumps. */
export function ErrorEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    borderRadius: 8,
  });
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{ stroke: "#D4654C", strokeWidth: 1.5, strokeDasharray: "6 4" }}
        markerEnd={props.markerEnd}
      />
      {props.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="absolute pointer-events-none px-1.5 py-0.5 rounded-sm bg-ink-800 border border-rose/40 text-[10px] font-mono text-rose"
          >
            on error: {props.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function styleForKind(kind: string) {
  switch (kind) {
    case "branch_then":
      return { stroke: "#7BD7E4", dash: undefined, width: 1.5 };
    case "branch_else":
      return { stroke: "#7BD7E4", dash: "3 3", width: 1.5 };
    case "loop_iter":
      return { stroke: "#E8A33D", dash: undefined, width: 1.5 };
    case "loop_back":
      return { stroke: "#E8A33D", dash: "2 4", width: 1.5 };
    case "parallel_fork":
      return { stroke: "#8FBC6E", dash: undefined, width: 1.5 };
    case "data":
      // Data edges (from ${steps.X.…} refs) are subtle so they don't crowd
      // the canvas in flow view. The data view mode promotes them visually.
      return { stroke: "#7BD7E4", dash: "1 5", width: 1 };
    case "fall_through":
      return { stroke: "#7E7460", dash: undefined, width: 1.25 };
    case "next":
    default:
      return { stroke: "#B5781E", dash: undefined, width: 1.5 };
  }
}
