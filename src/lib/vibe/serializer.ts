import yaml from "js-yaml";
import type { Vibe, VibeNode } from "./schema";

/**
 * serializeVibe — turn a typed Vibe back into YAML.
 *
 * Strips synthetic `kind:` markers for control-flow nodes so the output stays
 * idiomatic — `kind: if` is implied by the presence of `condition:` + `then:`.
 * (We keep `kind: step` off by default too; a node with `function:` is a step.)
 *
 * We sort keys in a stable, human-friendly order so canvas-driven edits don't
 * scramble the YAML pane's line numbers on every keystroke. That's the single
 * biggest UX win over the reference editor's textarea churn.
 */
export function serializeVibe(vibe: Vibe): string {
  const out = {
    workflow: {
      id: vibe.workflow.id,
      ...(vibe.workflow.name ? { name: vibe.workflow.name } : {}),
      ...(vibe.workflow.description ? { description: vibe.workflow.description } : {}),
      ...(vibe.workflow.version ? { version: vibe.workflow.version } : {}),
      ...(vibe.workflow.variables?.length ? { variables: vibe.workflow.variables } : {}),
      steps: vibe.workflow.steps.map(stripNode),
      ...(vibe.workflow.on_error_step_id
        ? { on_error_step_id: vibe.workflow.on_error_step_id }
        : {}),
    },
  };
  return yaml.dump(out, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
}

/**
 * Recursively strip the synthetic `kind:` discriminator and order keys for
 * a stable, diff-friendly emit.
 */
function stripNode(node: VibeNode): Record<string, unknown> {
  const common: Record<string, unknown> = { id: node.id };
  if (node.description) common.description = node.description;

  switch (node.kind) {
    case "step":
      return {
        ...common,
        function: node.function,
        ...(node.input ? { input: node.input } : {}),
        ...(node.output ? { output: node.output } : {}),
        ...maybeFlow(node),
      };
    case "if":
      return {
        ...common,
        condition: node.condition,
        then: node.then.map(stripNode),
        ...(node.else ? { else: node.else.map(stripNode) } : {}),
        ...maybeFlow(node),
      };
    case "for_each":
      return {
        ...common,
        iterable: node.iterable,
        item: node.item,
        ...(node.index ? { index: node.index } : {}),
        body: node.body.map(stripNode),
        ...maybeFlow(node),
      };
    case "while":
      return {
        ...common,
        condition: node.condition,
        body: node.body.map(stripNode),
        ...maybeFlow(node),
      };
    case "parallel":
      return {
        ...common,
        branches: node.branches.map((b) => b.map(stripNode)),
        ...maybeFlow(node),
      };
    case "import":
      return {
        ...common,
        source: node.source,
        ...(node.with ? { with: node.with } : {}),
        ...maybeFlow(node),
      };
  }
}

function maybeFlow(node: VibeNode) {
  const out: Record<string, unknown> = {};
  if (node.next_step_id) out.next_step_id = node.next_step_id;
  if (node.on_error_step_id) out.on_error_step_id = node.on_error_step_id;
  if (node.error_message) out.error_message = node.error_message;
  return out;
}
