import ELK from "elkjs/lib/elk.bundled.js";
import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";

/**
 * applyLayout — run ELK's `layered` algorithm over the React Flow graph.
 *
 * The reference editor uses a hand-rolled serpentine layout that looks tidy
 * for flat Vibes but produces edge crossings the moment you introduce a
 * conditional branch. ELK's `layered` algorithm — the same engine the
 * Eclipse IDE uses for its data-flow diagrams — handles nesting, layering,
 * and edge routing in one pass, and is the only practical way to keep a
 * 50-node Vibe with three nested for_each loops readable.
 *
 * We feed React Flow's parent/child relationship straight into ELK's
 * hierarchy: container nodes become ELK groups with their children inside.
 */

const elk = new ELK();

// Node sizes per kind. Containers must be big enough that ELK pads correctly
// around their children even on the first layout pass.
const NODE_SIZE: Record<string, { width: number; height: number }> = {
  start: { width: 160, height: 56 },
  step: { width: 220, height: 96 },
  conditional: { width: 260, height: 140 },
  loop: { width: 260, height: 140 },
  parallel: { width: 260, height: 140 },
  import: { width: 220, height: 96 },
};

export async function applyLayout(
  nodes: RFNode[],
  edges: RFEdge[],
  direction: "DOWN" | "RIGHT" = "DOWN",
): Promise<{ nodes: RFNode[]; edges: RFEdge[] }> {
  if (nodes.length === 0) return { nodes, edges };

  // Build a parent → children map so we can emit ELK's nested structure.
  const childrenOf = new Map<string | undefined, RFNode[]>();
  for (const n of nodes) {
    const key = (n.parentId as string | undefined) ?? undefined;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(n);
  }

  const toElk = (parent?: string): Record<string, unknown>[] =>
    (childrenOf.get(parent) ?? []).map((n) => {
      const size = NODE_SIZE[n.type ?? "step"] ?? NODE_SIZE.step;
      const kids = toElk(n.id);
      return {
        id: n.id,
        width: kids.length ? undefined : size.width,
        height: kids.length ? undefined : size.height,
        ...(kids.length
          ? {
              children: kids,
              layoutOptions: {
                "elk.algorithm": "layered",
                "elk.direction": direction,
                "elk.padding": "[top=44,left=20,bottom=20,right=20]",
              },
            }
          : {}),
      };
    });

  // ELK input edges: only include edges that actually drive layout direction
  // AND whose endpoints sit in the same hierarchy level. The killer crash
  // we hit before was edges crossing parent/child boundaries — loop-back
  // edges from a child up to its for_each parent, branch edges from an if
  // header into its then-child, parallel forks, data refs from inside a
  // loop body to a step outside it. ELK's layered algorithm can't route
  // any of those and throws `Cannot read properties of null (reading 're')`.
  // We filter them out here; React Flow still renders them on top of the
  // positions ELK gave us.
  const parentOf = new Map<string, string | undefined>();
  for (const n of nodes) parentOf.set(n.id, (n.parentId as string | undefined) ?? undefined);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const isDataEdge = (e: RFEdge): boolean =>
    (e.data as { kind?: string } | undefined)?.kind === "data";
  const isLoopBack = (e: RFEdge): boolean =>
    (e.data as { kind?: string } | undefined)?.kind === "loop_back";
  const sameParent = (a: string, b: string): boolean =>
    parentOf.get(a) === parentOf.get(b);
  const layoutEdges = edges.filter(
    (e) =>
      !isDataEdge(e) &&
      !isLoopBack(e) &&
      nodeIds.has(e.source) &&
      nodeIds.has(e.target) &&
      sameParent(e.source, e.target),
  );

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.spacing.nodeNode": "40",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: toElk(undefined),
    edges: layoutEdges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  let laid: Awaited<ReturnType<typeof elk.layout>>;
  try {
    laid = await elk.layout(elkGraph as unknown as Parameters<typeof elk.layout>[0]);
  } catch (err) {
    // ELK can still throw on pathological graphs (cycles between containers,
    // etc). Fall back to a grid layout so the canvas remains usable instead
    // of going blank with a runtime error.
    if (typeof console !== "undefined") {
      console.warn("[vibegraph] ELK layout failed; falling back to grid", err);
    }
    return fallbackGridLayout(nodes, edges);
  }
  const positions = new Map<string, { x: number; y: number; w?: number; h?: number }>();

  const collect = (n: { id?: string; x?: number; y?: number; width?: number; height?: number; children?: unknown[] }, dx = 0, dy = 0) => {
    if (n.id) {
      const ax = (n.x ?? 0) + dx;
      const ay = (n.y ?? 0) + dy;
      positions.set(n.id, { x: ax, y: ay, w: n.width, h: n.height });
      if (Array.isArray(n.children)) {
        // ELK gives child coords relative to parent; React Flow wants them
        // relative to parent too (when `parentId` is set), so we don't
        // accumulate offsets here — but we DO need absolute coords for the
        // outer dx/dy if a grandchild somehow appears without a parentId.
        for (const c of n.children) collect(c as Parameters<typeof collect>[0], 0, 0);
      }
    }
  };
  collect(laid as Parameters<typeof collect>[0]);

  const positionedNodes = nodes.map((n) => {
    const p = positions.get(n.id);
    if (!p) return n;
    return {
      ...n,
      position: { x: p.x, y: p.y },
      ...(p.w && p.h && (childrenOf.get(n.id)?.length ?? 0) > 0
        ? { style: { ...n.style, width: p.w, height: p.h } }
        : {}),
    };
  });

  return { nodes: positionedNodes, edges };
}

/**
 * fallbackGridLayout — runs only when ELK throws. Places nodes in a
 * deterministic 4-column grid so the canvas remains usable; the layout
 * isn't pretty but it's better than a blank screen plus a runtime error.
 */
function fallbackGridLayout(nodes: RFNode[], edges: RFEdge[]) {
  const COLS = 4;
  const W = 260;
  const H = 160;
  const placed = nodes.map((n, i) => ({
    ...n,
    position: { x: (i % COLS) * W, y: Math.floor(i / COLS) * H },
  }));
  return { nodes: placed, edges };
}
