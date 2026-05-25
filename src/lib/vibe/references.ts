/**
 * Vibe reference grammar.
 *
 * A Vibe is just YAML, but its string values frequently contain references
 * that drive the runtime behaviour. There are four flavours we recognize:
 *
 *   ${steps.X.output.path...}   → output of an earlier step
 *   ${secrets.NAME}             → injected secret
 *   ${uniqueData.NAME}          → trigger / payload data
 *   ${system.NAME}              → runtime metadata (timestamp, request_id, etc)
 *
 * Plus, as a convenience shorthand introduced by VibeGraph's container
 * primitives, `$NAME` resolves to a variable declared by:
 *   - `workflow.variables`              (workflow-scope)
 *   - a `for_each` node's `item`/`index`
 *   - a step's `output:` field
 *
 * All graph, scope, and validation logic dispatches off the helpers here so
 * the grammar lives in exactly one place.
 */

/** A single reference found inside a serialized node body. */
export interface Reference {
  /** Where in the Vibe the reference points. */
  kind: "step_output" | "secret" | "unique_data" | "system" | "variable";
  /** For step references, the step id; for others, the name being referenced. */
  name: string;
  /** Full original token (e.g. `${steps.foo.output.bar.baz}`). */
  raw: string;
}

/**
 * Matches every reference in a serialized blob. Group 1 captures the namespace
 * (steps|secrets|uniqueData|system) and group 2 captures the immediate name —
 * the first segment after the namespace.
 *
 * The dollar-shorthand `$foo` is matched separately so we don't accidentally
 * eat ASCII inside `${steps.foo}`.
 */
const TEMPLATE_RE =
  /\$\{(steps|secrets|uniqueData|system)\.([a-zA-Z_][a-zA-Z0-9_-]*)([^}]*)\}/g;
const SHORTHAND_RE = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;

/** Extract every reference from any JSON-serializable value. */
export function findReferences(value: unknown): Reference[] {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const out: Reference[] = [];

  for (const m of text.matchAll(TEMPLATE_RE)) {
    const ns = m[1] as "steps" | "secrets" | "uniqueData" | "system";
    out.push({
      kind:
        ns === "steps"
          ? "step_output"
          : ns === "secrets"
          ? "secret"
          : ns === "uniqueData"
          ? "unique_data"
          : "system",
      name: m[2],
      raw: m[0],
    });
  }

  // Strip out `${...}` matches before scanning for `$shorthand` so we don't
  // double-count the dollar sign at the start of a template reference.
  const withoutTemplates = text.replace(TEMPLATE_RE, "");
  for (const m of withoutTemplates.matchAll(SHORTHAND_RE)) {
    out.push({ kind: "variable", name: m[1], raw: m[0] });
  }

  return out;
}

/**
 * Rewrite every `${steps.OLD...}` reference inside a value to point at NEW.
 * Recursively walks objects/arrays. Returns a new value (does not mutate).
 *
 * This is what powers the "rename a step → all callers update automatically"
 * UX that the reference editor pioneered. Without it, a rename is a 30-second
 * grep-and-replace job; with it, it's a single keystroke.
 */
export function renameStepReferences<T>(value: T, oldId: string, newId: string): T {
  if (oldId === newId) return value;
  const oldRef = `\${steps.${oldId}.`;
  const newRef = `\${steps.${newId}.`;
  // Bare reference (just `${steps.OLD}` with no field access) is also valid.
  const oldBare = `\${steps.${oldId}}`;
  const newBare = `\${steps.${newId}}`;

  const recurse = (v: unknown): unknown => {
    if (typeof v === "string") {
      return v.replaceAll(oldRef, newRef).replaceAll(oldBare, newBare);
    }
    if (Array.isArray(v)) return v.map(recurse);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, sub] of Object.entries(v as Record<string, unknown>)) {
        out[k] = recurse(sub);
      }
      return out;
    }
    return v;
  };
  return recurse(value) as T;
}

/**
 * Remove fields whose string values reference a now-deleted step.
 *
 * Returns `undefined` if the value itself is a reference to the deleted step,
 * so callers can prune the parent property cleanly.
 */
export function stripStepReferences<T>(value: T, deletedId: string): T | undefined {
  const refMarker = `\${steps.${deletedId}.`;
  const refBare = `\${steps.${deletedId}}`;

  const recurse = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v.includes(refMarker) || v === refBare) return undefined;
      return v;
    }
    if (Array.isArray(v)) {
      return v.map(recurse).filter((x) => x !== undefined);
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, sub] of Object.entries(v as Record<string, unknown>)) {
        const cleaned = recurse(sub);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }
    return v;
  };
  return recurse(value) as T | undefined;
}
