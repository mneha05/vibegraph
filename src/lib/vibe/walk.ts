import type { VibeNode, IfNode, ForEachNode, WhileNode, ParallelNode } from "./schema";

/** Context passed to every walker visit. */
export interface WalkContext {
  /** Dotted YAML path, e.g. `workflow.steps[2].then[0]`. */
  path: string;
  /** Stack of container node IDs we're nested inside. Empty at root. */
  scopePath: string[];
  /** Depth (0 at root). */
  depth: number;
}

export type Visitor = (node: VibeNode, ctx: WalkContext) => void;

/**
 * walk — depth-first traversal of a Vibe step list. Recurses into every
 * container (if.then, if.else, for_each.body, while.body, parallel.branches[])
 * while keeping accurate YAML paths and a scope path that the validator and
 * scope analyzer use to enforce id uniqueness and variable visibility.
 */
export function walk(steps: VibeNode[], visit: Visitor) {
  const recurse = (
    list: VibeNode[],
    basePath: string,
    scopePath: string[],
    depth: number,
  ) => {
    list.forEach((node, i) => {
      const path = `${basePath}[${i}]`;
      visit(node, { path, scopePath, depth });

      switch (node.kind) {
        case "if": {
          const n = node as IfNode;
          recurse(n.then, `${path}.then`, [...scopePath, node.id], depth + 1);
          if (n.else) recurse(n.else, `${path}.else`, [...scopePath, node.id], depth + 1);
          break;
        }
        case "for_each":
          recurse((node as ForEachNode).body, `${path}.body`, [...scopePath, node.id], depth + 1);
          break;
        case "while":
          recurse((node as WhileNode).body, `${path}.body`, [...scopePath, node.id], depth + 1);
          break;
        case "parallel": {
          const n = node as ParallelNode;
          n.branches.forEach((b, bi) =>
            recurse(b, `${path}.branches[${bi}]`, [...scopePath, node.id], depth + 1),
          );
          break;
        }
        // step / import have no children.
      }
    });
  };
  recurse(steps, "workflow.steps", [], 0);
}
