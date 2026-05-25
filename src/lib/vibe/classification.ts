import type { Vibe, VibeNode } from "./schema";
import { walk } from "./walk";

/**
 * Semantic role of a step inside the workflow. Drives the canvas's color
 * convention — error handlers stand out in amber, terminating errors in
 * crimson, conclusions in sage with a checkmark badge, start nodes get
 * the entry flag, everything else is the default ink/amber surface.
 *
 * Roles are derived purely from graph topology + naming heuristics, not
 * declared by the author. A node is:
 *   - "start"            : first sibling at the top level (entry point)
 *   - "conclusion"       : function === concludeWorkflow or id ends in
 *                          _done / _complete / _completed / "done"
 *   - "error_handler"    : pointed at by another node's `on_error_step_id`
 *   - "terminating_error": error_handler with no outgoing flow (dead end)
 *   - "normal"           : everything else
 */
export type StepRole =
  | "start"
  | "conclusion"
  | "error_handler"
  | "terminating_error"
  | "normal";

export interface StepClassification {
  roles: Map<string, StepRole>;
  startIds: Set<string>;
  conclusionIds: Set<string>;
  errorHandlerIds: Set<string>;
  terminatingIds: Set<string>;
}

export function classifySteps(vibe: Vibe): StepClassification {
  const errorHandlerIds = new Set<string>();
  const outgoingFromId = new Map<string, number>();

  // Pass 1: find every node that's an error handler target.
  walk(vibe.workflow.steps, (n) => {
    if (n.on_error_step_id) errorHandlerIds.add(n.on_error_step_id);
  });

  // Pass 2: count outgoing edges per node (next + siblings fall-through).
  const recordOutgoing = (id: string) => {
    outgoingFromId.set(id, (outgoingFromId.get(id) ?? 0) + 1);
  };
  const walkOutgoing = (list: VibeNode[]) => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.next_step_id) recordOutgoing(n.id);
      else if (i + 1 < list.length) recordOutgoing(n.id);
      if (n.on_error_step_id) recordOutgoing(n.id);
      if (n.kind === "if") {
        walkOutgoing(n.then);
        if (n.else) walkOutgoing(n.else);
      } else if (n.kind === "for_each" || n.kind === "while") {
        walkOutgoing(n.body);
      } else if (n.kind === "parallel") {
        n.branches.forEach(walkOutgoing);
      }
    }
  };
  walkOutgoing(vibe.workflow.steps);

  const startIds = new Set<string>();
  if (vibe.workflow.steps[0]) startIds.add(vibe.workflow.steps[0].id);

  const conclusionIds = new Set<string>();
  const terminatingIds = new Set<string>();
  const roles = new Map<string, StepRole>();

  walk(vibe.workflow.steps, (n) => {
    const id = n.id;
    const isConclusion =
      (n.kind === "step" && n.function === "concludeWorkflow") ||
      id === "done" ||
      id.endsWith("_done") ||
      id.endsWith("_complete") ||
      id.endsWith("_completed");
    if (isConclusion) conclusionIds.add(id);

    const isErrorHandler = errorHandlerIds.has(id);
    const isTerminatingError =
      isErrorHandler && (outgoingFromId.get(id) ?? 0) === 0 && !isConclusion;
    if (isTerminatingError) terminatingIds.add(id);

    let role: StepRole = "normal";
    if (isConclusion) role = "conclusion";
    else if (isTerminatingError) role = "terminating_error";
    else if (isErrorHandler) role = "error_handler";
    if (startIds.has(id)) role = "start"; // start beats everything
    roles.set(id, role);
  });

  return { roles, startIds, conclusionIds, errorHandlerIds, terminatingIds };
}
