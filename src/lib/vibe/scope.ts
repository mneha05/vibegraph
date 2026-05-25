import type { Vibe, VibeNode, ForEachNode, StepNode } from "./schema";
import { walk } from "./walk";
import { findReferences } from "./references";

/**
 * Scope analysis answers two questions the inspector pane asks constantly:
 *
 *   1. "Where is `$X` (or `${steps.X.…}`) declared?"   → highlight that node
 *   2. "Where is `$X` (or `${steps.X.…}`) read?"       → highlight every reader
 *
 * This is the data behind the cyan data-flow overlay the canvas renders when
 * a user clicks a variable chip in the Variables panel.
 *
 * Variables and step outputs are unified here — both end up in the same
 * `Map<string, VariableUsage>`. A step output named `customer` and a
 * workflow variable named `customer` would conflict, which is fine because
 * the validator would have flagged it as a duplicate id anyway.
 */

export interface VariableUsage {
  name: string;
  /** Where it's introduced. */
  declaredAt?: {
    kind: "workflow_var" | "for_each_item" | "for_each_index" | "step_output" | "step";
    nodeId?: string;
  };
  /** Node ids that read this variable / step output. */
  readers: string[];
  /** Node ids that write/produce it. */
  writers: string[];
}

export function analyzeScope(vibe: Vibe): Map<string, VariableUsage> {
  const usages = new Map<string, VariableUsage>();
  const ensure = (name: string): VariableUsage => {
    if (!usages.has(name)) usages.set(name, { name, readers: [], writers: [] });
    return usages.get(name)!;
  };

  // Workflow-scope variables.
  for (const v of vibe.workflow.variables ?? []) {
    ensure(v.name).declaredAt = { kind: "workflow_var" };
  }

  // Every step's id is implicitly available as `${steps.ID.output}` — track
  // it so the data overlay can highlight downstream consumers of a step.
  walk(vibe.workflow.steps, (node) => {
    if (node.kind === "step" || node.kind === "import") {
      const u = ensure(node.id);
      u.declaredAt ??= { kind: "step", nodeId: node.id };
      u.writers.push(node.id);
    }
  });

  // for_each item/index bindings + explicit output: vars.
  walk(vibe.workflow.steps, (node) => {
    if (node.kind === "for_each") {
      const fe = node as ForEachNode;
      const u = ensure(fe.item);
      u.declaredAt ??= { kind: "for_each_item", nodeId: fe.id };
      if (fe.index) {
        const ui = ensure(fe.index);
        ui.declaredAt ??= { kind: "for_each_index", nodeId: fe.id };
      }
    }
    if (node.kind === "step") {
      const s = node as StepNode;
      if (s.output) {
        const u = ensure(s.output);
        u.declaredAt ??= { kind: "step_output", nodeId: s.id };
        u.writers.push(s.id);
      }
    }
  });

  // References — collect every reader in one pass via the shared grammar.
  walk(vibe.workflow.steps, (node) => {
    const found = new Set<string>();
    for (const ref of findReferences(node)) {
      if (ref.kind === "secret" || ref.kind === "unique_data" || ref.kind === "system") continue;
      if (found.has(ref.name)) continue;
      found.add(ref.name);
      ensure(ref.name).readers.push(node.id);
    }
  });

  return usages;
}

/** Set of node ids touched by the given usage. */
export function touchedBy(usage: VariableUsage | undefined): Set<string> {
  const set = new Set<string>();
  if (!usage) return set;
  if (usage.declaredAt?.nodeId) set.add(usage.declaredAt.nodeId);
  for (const id of usage.readers) set.add(id);
  for (const id of usage.writers) set.add(id);
  return set;
}

/** Container chains a variable appears inside — used for nested-scope overlays. */
export function containingScopes(vibe: Vibe, name: string): string[] {
  const out: string[] = [];
  const marker = `\${steps.${name}.`;
  const bare = `\${steps.${name}}`;
  const recurse = (steps: VibeNode[], chain: string[]) => {
    for (const s of steps) {
      const text = JSON.stringify(s);
      if (text.includes(`$${name}`) || text.includes(marker) || text.includes(bare)) {
        out.push(...chain);
      }
      const children =
        s.kind === "if"
          ? [...(s as { then: VibeNode[] }).then, ...((s as { else?: VibeNode[] }).else ?? [])]
          : s.kind === "for_each" || s.kind === "while"
          ? (s as { body: VibeNode[] }).body
          : s.kind === "parallel"
          ? (s as { branches: VibeNode[][] }).branches.flat()
          : [];
      if (children.length) recurse(children, [...chain, s.id]);
    }
  };
  recurse(vibe.workflow.steps, []);
  return Array.from(new Set(out));
}
