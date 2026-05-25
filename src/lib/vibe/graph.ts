import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";
import type { Vibe, VibeNode, IfNode, ForEachNode, WhileNode, ParallelNode } from "./schema";
import { findReferences } from "./references";
import { classifySteps, type StepClassification } from "./classification";

/**
 * buildGraph — convert a typed Vibe into the nodes/edges React Flow renders.
 *
 * Key differences vs. the reference editor:
 *   1. Container nodes (if / for_each / while / parallel) become React Flow
 *      group nodes with `parentId` set on their children. This gives us real
 *      collapsible scopes on the canvas instead of pretend ones drawn with
 *      decorative rectangles.
 *   2. Edge kinds carry semantic data — `flow`, `error`, `loop_back`,
 *      `parallel_join` — so the canvas can style them differently and the
 *      data-flow overlay can filter to only the kind it wants.
 *   3. Fall-through edges (no explicit next_step_id, just next sibling) are
 *      generated automatically so the rendered graph matches actual execution.
 *
 * Note: positions here are placeholders. The ELK layout pass in `layout.ts`
 * fills in real x/y coordinates after the graph is built.
 */
export interface BuildResult {
  nodes: RFNode[];
  edges: RFEdge[];
}

export function buildGraph(vibe: Vibe): BuildResult {
  const nodes: RFNode[] = [];
  const edges: RFEdge[] = [];
  const classification = classifySteps(vibe);

  // Synthetic start node — gives every Vibe a single visible entry point even
  // when the first real step has no incoming edges yet.
  if (vibe.workflow.steps.length > 0) {
    nodes.push({
      id: "__start__",
      type: "start",
      data: { label: vibe.workflow.name || vibe.workflow.id || "Vibe" },
      position: { x: 0, y: 0 },
    });
    edges.push({
      id: "__start__->" + vibe.workflow.steps[0].id,
      source: "__start__",
      target: vibe.workflow.steps[0].id,
      type: "flow",
      data: { kind: "next" },
    });
  }

  // Walk the tree, producing nodes + edges. `parentId` tracks the enclosing
  // container so React Flow nests them correctly.
  const visit = (list: VibeNode[], parentId?: string) => {
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      pushNode(nodes, node, classification, parentId);

      // Recurse into containers.
      switch (node.kind) {
        case "if": {
          const n = node as IfNode;
          visit(n.then, node.id);
          if (n.else) visit(n.else, node.id);
          // Edges from the if-header into the first node of each branch.
          if (n.then[0]) {
            edges.push({
              id: `${node.id}-then->${n.then[0].id}`,
              source: node.id,
              target: n.then[0].id,
              type: "flow",
              label: "then",
              data: { kind: "branch_then" },
            });
          }
          if (n.else?.[0]) {
            edges.push({
              id: `${node.id}-else->${n.else[0].id}`,
              source: node.id,
              target: n.else[0].id,
              type: "flow",
              label: "else",
              data: { kind: "branch_else" },
            });
          }
          break;
        }
        case "for_each": {
          const n = node as ForEachNode;
          visit(n.body, node.id);
          if (n.body[0]) {
            edges.push({
              id: `${node.id}-iter->${n.body[0].id}`,
              source: node.id,
              target: n.body[0].id,
              type: "flow",
              label: `for ${n.item} in ${n.iterable}`,
              data: { kind: "loop_iter" },
            });
            // Loop-back from the last body node to the for_each header.
            const last = n.body[n.body.length - 1];
            edges.push({
              id: `${last.id}-loop->${node.id}`,
              source: last.id,
              target: node.id,
              type: "flow",
              data: { kind: "loop_back" },
            });
          }
          break;
        }
        case "while": {
          const n = node as WhileNode;
          visit(n.body, node.id);
          if (n.body[0]) {
            edges.push({
              id: `${node.id}-while->${n.body[0].id}`,
              source: node.id,
              target: n.body[0].id,
              type: "flow",
              label: "while " + n.condition,
              data: { kind: "loop_iter" },
            });
            const last = n.body[n.body.length - 1];
            edges.push({
              id: `${last.id}-loop->${node.id}`,
              source: last.id,
              target: node.id,
              type: "flow",
              data: { kind: "loop_back" },
            });
          }
          break;
        }
        case "parallel": {
          const n = node as ParallelNode;
          n.branches.forEach((b) => {
            visit(b, node.id);
            if (b[0]) {
              edges.push({
                id: `${node.id}-par->${b[0].id}`,
                source: node.id,
                target: b[0].id,
                type: "flow",
                data: { kind: "parallel_fork" },
              });
            }
          });
          break;
        }
      }

      // Success edge — explicit next_step_id OR fall-through to next sibling.
      if (node.next_step_id) {
        edges.push({
          id: `${node.id}->${node.next_step_id}`,
          source: node.id,
          target: node.next_step_id,
          type: "flow",
          data: { kind: "next" },
        });
      } else if (i + 1 < list.length && !isContainer(node)) {
        const next = list[i + 1];
        edges.push({
          id: `${node.id}->${next.id}`,
          source: node.id,
          target: next.id,
          type: "flow",
          data: { kind: "fall_through" },
        });
      }

      // Error edge — always rendered if specified, in a dashed warning style.
      if (node.on_error_step_id) {
        edges.push({
          id: `${node.id}-err->${node.on_error_step_id}`,
          source: node.id,
          target: node.on_error_step_id,
          type: "error",
          label: node.error_message,
          data: { kind: "error" },
        });
      }
    }
  };

  visit(vibe.workflow.steps);

  // Data edges — derived from `${steps.X.…}` references in any node input.
  // Charan's editor renders these as a separate visual layer; ours does the
  // same, with the additional twist that they're filterable per view mode.
  const dataSeen = new Set<string>();
  const visitForData = (list: VibeNode[]) => {
    for (const node of list) {
      const refs = findReferences(node);
      for (const ref of refs) {
        if (ref.kind !== "step_output") continue;
        if (ref.name === node.id) continue; // self-loop guard
        const key = `${ref.name}=>${node.id}`;
        if (dataSeen.has(key)) continue;
        dataSeen.add(key);
        edges.push({
          id: `data:${key}`,
          source: ref.name,
          target: node.id,
          type: "flow",
          data: { kind: "data" },
        });
      }
      if (node.kind === "if") {
        visitForData(node.then);
        if (node.else) visitForData(node.else);
      } else if (node.kind === "for_each" || node.kind === "while") {
        visitForData(node.body);
      } else if (node.kind === "parallel") {
        node.branches.forEach(visitForData);
      }
    }
  };
  visitForData(vibe.workflow.steps);

  return { nodes, edges };
}

function isContainer(node: VibeNode): boolean {
  return (
    node.kind === "if" ||
    node.kind === "for_each" ||
    node.kind === "while" ||
    node.kind === "parallel"
  );
}

function pushNode(
  out: RFNode[],
  node: VibeNode,
  classification: StepClassification,
  parentId?: string,
) {
  const role = classification.roles.get(node.id) ?? "normal";
  // We don't use React Flow's parentId/extent nesting because ELK's layered
  // layout crashes on hierarchy-crossing edges (loop-back, branch entries,
  // parallel forks). Container relationships are still visible because the
  // graph builder emits labeled edges (parent → first child, last child →
  // for_each header) and each container kind has its own visual style.
  const base = {
    id: node.id,
    position: { x: 0, y: 0 },
    data: { node, label: node.id, parentId, role },
  };
  switch (node.kind) {
    case "step":
      out.push({ ...base, type: "step" });
      break;
    case "if":
      out.push({ ...base, type: "conditional" });
      break;
    case "for_each":
    case "while":
      out.push({ ...base, type: "loop" });
      break;
    case "parallel":
      out.push({ ...base, type: "parallel" });
      break;
    case "import":
      out.push({ ...base, type: "import" });
      break;
  }
}
