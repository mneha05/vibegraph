import yaml from "js-yaml";
import type {
  Vibe,
  VibeNode,
  StepNode,
  IfNode,
  ForEachNode,
  WhileNode,
  ParallelNode,
  ImportNode,
} from "./schema";

/**
 * parseVibe — turn a YAML string into a typed Vibe.
 *
 * The reference editor only understands flat `steps:` lists. We accept those
 * AND modern control-flow constructs (if/for_each/while/parallel/import).
 * If a step has no explicit `kind:` we infer it from the shape — this keeps
 * us backward-compatible with every Charan-style Vibe that exists today.
 *
 * Throws on malformed YAML so the caller (sync engine) can surface the error
 * inside the YAML pane as a squiggle instead of a console explosion.
 */
export function parseVibe(source: string): Vibe {
  // Empty input is valid — represents "no Vibe loaded yet".
  if (!source.trim()) {
    return { workflow: { id: "", steps: [] } };
  }

  const raw = yaml.load(source);
  if (!raw || typeof raw !== "object") {
    throw new Error("Vibe YAML must be a mapping (got " + typeof raw + ")");
  }
  const obj = raw as Record<string, unknown>;
  const workflow = obj.workflow as Record<string, unknown> | undefined;
  if (!workflow) {
    throw new Error("Missing top-level `workflow:` key");
  }

  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  return {
    workflow: {
      id: String(workflow.id ?? ""),
      name: workflow.name ? String(workflow.name) : undefined,
      description: workflow.description ? String(workflow.description) : undefined,
      version: workflow.version ? String(workflow.version) : undefined,
      variables: Array.isArray(workflow.variables)
        ? (workflow.variables as Vibe["workflow"]["variables"])
        : undefined,
      on_error_step_id: workflow.on_error_step_id
        ? String(workflow.on_error_step_id)
        : undefined,
      steps: steps.map((s) => normalizeNode(s)),
    },
  };
}

/**
 * Infer a node's `kind` from its shape and normalize it. Mutually exclusive
 * keys drive the discriminator:
 *   - `condition` + `then`        → if
 *   - `iterable` + `item`         → for_each
 *   - `condition` + `body`        → while
 *   - `branches`                  → parallel
 *   - `source` (looks importable) → import
 *   - else                        → step (function call)
 */
function normalizeNode(input: unknown): VibeNode {
  if (!input || typeof input !== "object") {
    // Defensive: turn garbage into a step so the rest of the pipeline doesn't crash.
    return { kind: "step", id: "invalid", function: "unknown" };
  }
  const n = input as Record<string, unknown>;
  const id = String(n.id ?? "");
  const base = {
    id,
    description: n.description ? String(n.description) : undefined,
    next_step_id: n.next_step_id ? String(n.next_step_id) : undefined,
    on_error_step_id: n.on_error_step_id ? String(n.on_error_step_id) : undefined,
    error_message: n.error_message ? String(n.error_message) : undefined,
  };

  // Explicit kind wins.
  const explicit = (n.kind as string | undefined)?.toLowerCase();
  const inferred = explicit ?? inferKind(n);

  switch (inferred) {
    case "if": {
      const out: IfNode = {
        ...base,
        kind: "if",
        condition: String(n.condition ?? ""),
        then: Array.isArray(n.then) ? n.then.map(normalizeNode) : [],
        else: Array.isArray(n.else) ? n.else.map(normalizeNode) : undefined,
      };
      return out;
    }
    case "for_each": {
      const out: ForEachNode = {
        ...base,
        kind: "for_each",
        iterable: String(n.iterable ?? n.in ?? ""),
        item: String(n.item ?? n.as ?? "item"),
        index: n.index ? String(n.index) : undefined,
        body: Array.isArray(n.body) ? n.body.map(normalizeNode) : [],
      };
      return out;
    }
    case "while": {
      const out: WhileNode = {
        ...base,
        kind: "while",
        condition: String(n.condition ?? ""),
        body: Array.isArray(n.body) ? n.body.map(normalizeNode) : [],
      };
      return out;
    }
    case "parallel": {
      const out: ParallelNode = {
        ...base,
        kind: "parallel",
        branches: Array.isArray(n.branches)
          ? n.branches.map((b) => (Array.isArray(b) ? b.map(normalizeNode) : []))
          : [],
      };
      return out;
    }
    case "import": {
      const out: ImportNode = {
        ...base,
        kind: "import",
        source: String(n.source ?? n.import ?? ""),
        with: (n.with as Record<string, unknown>) ?? undefined,
      };
      return out;
    }
    default: {
      const out: StepNode = {
        ...base,
        kind: "step",
        function: String(n.function ?? "setVariable"),
        input: (n.input as Record<string, unknown>) ?? undefined,
        output: n.output ? String(n.output) : undefined,
      };
      return out;
    }
  }
}

function inferKind(n: Record<string, unknown>): VibeNode["kind"] {
  if (n.then || (n.condition && n.else)) return "if";
  if (n.condition && n.body) return "while";
  if (n.iterable || n.in) return "for_each";
  if (Array.isArray(n.branches)) return "parallel";
  if (n.source || n.import) return "import";
  return "step";
}
