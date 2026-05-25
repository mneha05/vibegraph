import type {
  Vibe,
  VibeNode,
  ValidationIssue,
  IfNode,
  ForEachNode,
  WhileNode,
  ParallelNode,
} from "./schema";
import { walk } from "./walk";
import { findReferences } from "./references";

/**
 * validateVibe — the complete list of issues for a Vibe document.
 *
 * Checks performed:
 *   1. Required fields                  (workflow.id, every node has an id+function)
 *   2. Duplicate IDs                    (siblings only)
 *   3. Broken routing refs              (next_step_id / on_error_step_id)
 *   4. Broken `${steps.X.…}` refs       (string interpolation pointing at missing step)
 *   5. Unreachable steps                (no inbound flow from start)
 *   6. Undeclared `$var` shorthand      (variable not declared anywhere upstream)
 *   7. Empty containers                 (if-then with no children, etc)
 *   8. Missing imports                  (import node with empty source)
 *   9. Step input must be object        (not an array, not a primitive)
 */
export function validateVibe(vibe: Vibe): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!vibe.workflow.id) {
    issues.push({
      severity: "error",
      path: "workflow.id",
      message: "Vibe is missing required `workflow.id`",
      hint: "Add a kebab-case identifier — e.g. `id: ticket-triage`",
    });
  }

  const idsByScope = new Map<string, Set<string>>();
  walk(vibe.workflow.steps, (node, ctx) => {
    if (!node.id) {
      issues.push({
        severity: "error",
        path: ctx.path,
        message: "Node is missing required `id`",
      });
      return;
    }
    const scopeKey = ctx.scopePath.join("/") || "<root>";
    if (!idsByScope.has(scopeKey)) idsByScope.set(scopeKey, new Set());
    const seen = idsByScope.get(scopeKey)!;
    if (seen.has(node.id)) {
      issues.push({
        severity: "error",
        nodeId: node.id,
        path: ctx.path,
        message: `Duplicate id \`${node.id}\` in the same scope`,
        hint: "Sibling node ids must be unique within their container",
      });
    }
    seen.add(node.id);
  });

  walk(vibe.workflow.steps, (node, ctx) => {
    if (node.kind === "step" && !node.function?.trim()) {
      issues.push({
        severity: "error",
        nodeId: node.id,
        path: `${ctx.path}.function`,
        message: `Step \`${node.id}\` is missing \`function:\``,
      });
    }
    if (node.kind === "step" && node.input !== undefined) {
      if (node.input === null || typeof node.input !== "object" || Array.isArray(node.input)) {
        issues.push({
          severity: "error",
          nodeId: node.id,
          path: `${ctx.path}.input`,
          message: `Step \`${node.id}\` \`input\` must be a mapping (got ${Array.isArray(node.input) ? "array" : typeof node.input})`,
        });
      }
    }
  });

  const allIds = collectAllIds(vibe.workflow.steps);

  walk(vibe.workflow.steps, (node, ctx) => {
    if (node.next_step_id && !allIds.has(node.next_step_id)) {
      issues.push({
        severity: "error",
        nodeId: node.id,
        path: `${ctx.path}.next_step_id`,
        message: `\`next_step_id: ${node.next_step_id}\` points to a node that does not exist`,
        hint: "Either create that node or remove the pointer to fall through to the next sibling",
      });
    }
    if (node.on_error_step_id && !allIds.has(node.on_error_step_id)) {
      issues.push({
        severity: "error",
        nodeId: node.id,
        path: `${ctx.path}.on_error_step_id`,
        message: `\`on_error_step_id: ${node.on_error_step_id}\` points to a node that does not exist`,
      });
    }
  });

  walk(vibe.workflow.steps, (node, ctx) => {
    const refs = findReferences(node);
    const seen = new Set<string>();
    for (const ref of refs) {
      if (ref.kind !== "step_output") continue;
      const key = `${ref.kind}:${ref.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!allIds.has(ref.name)) {
        issues.push({
          severity: "error",
          nodeId: node.id,
          path: ctx.path,
          message: `Step \`${node.id}\` references \`${ref.raw}\` but step \`${ref.name}\` does not exist`,
          hint: "Rename the step, fix the reference, or remove the input field",
        });
      }
    }
  });

  walk(vibe.workflow.steps, (node, ctx) => {
    if (node.kind === "if" && (node as IfNode).then.length === 0) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        path: `${ctx.path}.then`,
        message: `\`if\` node \`${node.id}\` has an empty \`then\` branch`,
      });
    }
    if (node.kind === "for_each" && (node as ForEachNode).body.length === 0) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        path: `${ctx.path}.body`,
        message: `\`for_each\` node \`${node.id}\` has an empty body — the loop will do nothing`,
      });
    }
    if (node.kind === "while" && (node as WhileNode).body.length === 0) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        path: `${ctx.path}.body`,
        message: `\`while\` node \`${node.id}\` has an empty body`,
      });
    }
    if (
      node.kind === "parallel" &&
      (node as ParallelNode).branches.every((b) => b.length === 0)
    ) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        path: `${ctx.path}.branches`,
        message: `\`parallel\` node \`${node.id}\` has no branches`,
      });
    }
    if (node.kind === "import" && !(node as { source: string }).source) {
      issues.push({
        severity: "error",
        nodeId: node.id,
        path: `${ctx.path}.source`,
        message: `\`import\` node \`${node.id}\` is missing required \`source:\``,
      });
    }
  });

  const reachable = computeReachable(vibe.workflow.steps);
  walk(vibe.workflow.steps, (node, ctx) => {
    if (ctx.scopePath.length === 0 && !reachable.has(node.id) && node.id) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        path: ctx.path,
        message: `Step \`${node.id}\` is unreachable from the workflow entry`,
        hint: "Connect it from another step's `next_step_id`, or remove it",
      });
    }
  });

  const declaredVars = new Set<string>();
  for (const v of vibe.workflow.variables ?? []) declaredVars.add(v.name);
  walk(vibe.workflow.steps, (node) => {
    if (node.kind === "step" && (node as { output?: string }).output) {
      declaredVars.add((node as { output: string }).output);
    }
    if (node.kind === "for_each") {
      declaredVars.add((node as ForEachNode).item);
      if ((node as ForEachNode).index) declaredVars.add((node as ForEachNode).index!);
    }
  });
  walk(vibe.workflow.steps, (node, ctx) => {
    const refs = findReferences(node);
    const seen = new Set<string>();
    for (const ref of refs) {
      if (ref.kind !== "variable") continue;
      if (seen.has(ref.name)) continue;
      seen.add(ref.name);
      if (!declaredVars.has(ref.name)) {
        issues.push({
          severity: "info",
          nodeId: node.id,
          path: ctx.path,
          message: `Variable \`$${ref.name}\` is read but never declared`,
          hint: "Declare it in `workflow.variables` or assign it from an earlier step's `output:`",
        });
      }
    }
  });

  return issues;
}

function collectAllIds(steps: VibeNode[]): Set<string> {
  const ids = new Set<string>();
  walk(steps, (n) => {
    if (n.id) ids.add(n.id);
  });
  return ids;
}

function computeReachable(steps: VibeNode[]): Set<string> {
  const idIndex = new Map<string, { node: VibeNode; siblings: VibeNode[]; idx: number }>();
  for (let i = 0; i < steps.length; i++) {
    idIndex.set(steps[i].id, { node: steps[i], siblings: steps, idx: i });
  }
  const reachable = new Set<string>();
  if (steps.length === 0) return reachable;

  const queue: string[] = [steps[0].id];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const entry = idIndex.get(id);
    if (!entry) continue;
    const { node, siblings, idx } = entry;
    if (node.next_step_id) {
      queue.push(node.next_step_id);
    } else if (idx + 1 < siblings.length) {
      queue.push(siblings[idx + 1].id);
    }
    if (node.on_error_step_id) queue.push(node.on_error_step_id);
  }
  return reachable;
}
