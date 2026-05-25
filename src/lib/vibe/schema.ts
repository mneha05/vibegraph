/**
 * Vibe schema — the typed shape of a Vibes workflow template.
 *
 * The reference editor models a Vibe as a flat list of steps with `next_step_id`
 * and `on_error_step_id` pointers. That works for hello-world Vibes but falls
 * over the moment a real one shows up with loops, conditionals, imports, and
 * variable scope. VibeGraph treats those as first-class node kinds so the
 * canvas can render them as containers with proper scope boundaries, not as
 * a jumble of boxes with spaghetti edges.
 */

/** Discriminator for every node kind a Vibe can contain. */
export type VibeNodeKind =
  | "step" //          a regular function call (apiRequest, setVariable, …)
  | "if" //            conditional: branches into `then` / `else`
  | "for_each" //      iterates a collection; body executes per item
  | "while" //         loops while a condition holds
  | "parallel" //      runs N branches concurrently, joins on completion
  | "import" //        inlines another Vibe by reference
  | "start" //         synthetic entry marker (not serialized)
  | "end"; //          synthetic exit / terminator

/** Anything that can appear in a `steps:` list. */
export type VibeNode =
  | StepNode
  | IfNode
  | ForEachNode
  | WhileNode
  | ParallelNode
  | ImportNode;

/** Base fields shared by every concrete node. */
interface BaseNode {
  id: string;
  description?: string;
  /** ID of the next node to execute on success. Omit to fall through to next sibling. */
  next_step_id?: string;
  /** ID of the node to jump to on error. */
  on_error_step_id?: string;
  /** Optional error message surfaced when this node errors out. */
  error_message?: string;
}

export interface StepNode extends BaseNode {
  kind: "step";
  /** The function this step invokes — e.g. apiRequest, setVariable, llmCall. */
  function: string;
  /** Arbitrary input payload passed to the function. */
  input?: Record<string, unknown>;
  /** Optional output variable name where the function's return value is stored. */
  output?: string;
}

export interface IfNode extends BaseNode {
  kind: "if";
  /** Expression evaluated against current scope; truthy → `then`, falsy → `else`. */
  condition: string;
  then: VibeNode[];
  else?: VibeNode[];
}

export interface ForEachNode extends BaseNode {
  kind: "for_each";
  /** Expression that resolves to an iterable in scope. */
  iterable: string;
  /** Variable name bound to the current item inside `body`. */
  item: string;
  /** Optional variable name bound to the current index. */
  index?: string;
  body: VibeNode[];
}

export interface WhileNode extends BaseNode {
  kind: "while";
  condition: string;
  body: VibeNode[];
}

export interface ParallelNode extends BaseNode {
  kind: "parallel";
  /** Each branch runs concurrently; join waits for all. */
  branches: VibeNode[][];
}

export interface ImportNode extends BaseNode {
  kind: "import";
  /** Path or registry ref of the imported Vibe — e.g. `./auth.yml` or `org/common@1`. */
  source: string;
  /** Optional input mapping for the imported Vibe's parameters. */
  with?: Record<string, unknown>;
}

/** A Vibe variable declared at workflow scope. */
export interface VibeVariable {
  name: string;
  /** Optional default value. */
  default?: unknown;
  /** Free-form type hint — string, number, object, array, etc. */
  type?: string;
  description?: string;
}

/** Top-level workflow document. */
export interface Vibe {
  workflow: {
    id: string;
    name?: string;
    description?: string;
    version?: string;
    /** Workflow-scope variables. */
    variables?: VibeVariable[];
    /** Body of the workflow — the ordered list of nodes. */
    steps: VibeNode[];
    /** Optional global error handler step ID. */
    on_error_step_id?: string;
  };
}

/** A validation finding produced by the validator. Surfaced both inline (squiggles in the YAML pane) and as glow rings on graph nodes. */
export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  /** Optional node id the issue is anchored to. Omit for whole-doc issues. */
  nodeId?: string;
  /** Optional dotted YAML path — e.g. "workflow.steps[2].input.endpoint". */
  path?: string;
  message: string;
  /** Optional human-friendly fix suggestion. */
  hint?: string;
}
