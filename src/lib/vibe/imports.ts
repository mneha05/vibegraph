import { parseVibe } from "./parser";
import type { Vibe, VibeNode, ImportNode } from "./schema";
import { EXAMPLE_VIBES } from "@/examples";

/**
 * resolveImports — replace every `import` node in a Vibe with the resolved
 * sub-Vibe's steps, recursively. Cycle-safe.
 *
 * In a real deployment this would hit a Vibe registry / object store. For the
 * demo we resolve against the bundled example library — that's enough to
 * prove the inline-expansion UX works on the canvas (collapse / expand a
 * subgraph in place).
 */

export function resolveImports(vibe: Vibe, seen: Set<string> = new Set()): Vibe {
  return {
    workflow: {
      ...vibe.workflow,
      steps: vibe.workflow.steps.map((s) => resolveNode(s, seen)),
    },
  };
}

function resolveNode(node: VibeNode, seen: Set<string>): VibeNode {
  if (node.kind === "import") {
    const importNode = node as ImportNode;
    if (seen.has(importNode.source)) {
      // Cycle — leave the placeholder in place so the validator can flag it
      // and the canvas can render a clear "cyclical import" badge.
      return importNode;
    }
    const yamlSource = EXAMPLE_VIBES[importNode.source]?.yaml;
    if (!yamlSource) return importNode;
    try {
      const sub = parseVibe(yamlSource);
      const resolved = resolveImports(sub, new Set([...seen, importNode.source]));
      // We inline the imported steps under a synthetic group node carrying
      // the original import id so users can still target it from the
      // outer Vibe's `next_step_id` pointers.
      return {
        kind: "parallel",
        id: importNode.id,
        description: `(inlined from \`${importNode.source}\`)`,
        branches: [resolved.workflow.steps],
        next_step_id: importNode.next_step_id,
        on_error_step_id: importNode.on_error_step_id,
      };
    } catch {
      return importNode;
    }
  }
  // Recurse into containers.
  if (node.kind === "if") {
    return {
      ...node,
      then: node.then.map((c) => resolveNode(c, seen)),
      else: node.else?.map((c) => resolveNode(c, seen)),
    };
  }
  if (node.kind === "for_each" || node.kind === "while") {
    return { ...node, body: node.body.map((c) => resolveNode(c, seen)) };
  }
  if (node.kind === "parallel") {
    return { ...node, branches: node.branches.map((b) => b.map((c) => resolveNode(c, seen))) };
  }
  return node;
}
