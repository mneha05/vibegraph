import { parseVibe } from "../vibe/parser";
import { serializeVibe } from "../vibe/serializer";
import type { Vibe, ValidationIssue } from "../vibe/schema";

/**
 * SyncEngine — keeps the YAML pane and the canvas in lock-step without
 * ping-ponging changes back and forth.
 *
 * The non-obvious problem here: every edit on the canvas re-emits YAML, which
 * re-parses, which re-renders the canvas. Naively wired, you get an infinite
 * feedback loop or — worse — your cursor jumps every time the parser
 * re-derives the AST. The pattern below is the same one Linear's editor and
 * Notion's blocks use:
 *
 *   1. Edits are tagged with their `source`: "yaml" or "canvas".
 *   2. While we're applying an edit from source X, we set `_settling = X` so
 *      the X-side render is skipped (it already has the canonical value).
 *   3. After settling, a 60ms debounce window swallows in-flight retypes
 *      before re-emitting the other side.
 *
 * The engine is framework-agnostic — it doesn't know about React. The Zustand
 * store wires it into the UI; tests drive it directly.
 */

export type EditSource = "yaml" | "canvas" | "external";

export interface SyncState {
  yaml: string;
  vibe: Vibe;
  /** Schema/structural issues from the validator, surfaced both inline & in the issues panel. */
  issues: ValidationIssue[];
  /** YAML parse error (if any) — distinct from issues because the AST stays stale until parse succeeds. */
  parseError?: { message: string; line?: number; column?: number };
  /** Which side most recently changed — used to dim the opposite side's "saved" indicator. */
  lastSource: EditSource;
}

export type SyncSubscriber = (state: SyncState) => void;

export class SyncEngine {
  private state: SyncState;
  private subs = new Set<SyncSubscriber>();
  private settling: EditSource | null = null;

  constructor(initialYaml: string, validate: (v: Vibe) => ValidationIssue[]) {
    this.validate = validate;
    this.state = this.derive(initialYaml, "external");
  }

  private validate: (v: Vibe) => ValidationIssue[];

  getState(): SyncState {
    return this.state;
  }

  subscribe(fn: SyncSubscriber): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  /** Called when the YAML pane emits a change. Skipped if we're mid-settle from a canvas edit. */
  setYaml(yaml: string) {
    if (this.settling === "canvas") return;
    this.settling = "yaml";
    this.state = this.derive(yaml, "yaml");
    this.emit();
    this.settling = null;
  }

  /** Called when the canvas commits a structural change to the Vibe AST. */
  setVibe(vibe: Vibe) {
    if (this.settling === "yaml") return;
    this.settling = "canvas";
    try {
      const yaml = serializeVibe(vibe);
      this.state = {
        yaml,
        vibe,
        issues: this.validate(vibe),
        parseError: undefined,
        lastSource: "canvas",
      };
      this.emit();
    } finally {
      this.settling = null;
    }
  }

  /** External replacement (file import, template load). */
  load(yaml: string) {
    this.settling = "external";
    this.state = this.derive(yaml, "external");
    this.emit();
    this.settling = null;
  }

  private derive(yaml: string, source: EditSource): SyncState {
    try {
      const vibe = parseVibe(yaml);
      return {
        yaml,
        vibe,
        issues: this.validate(vibe),
        parseError: undefined,
        lastSource: source,
      };
    } catch (e) {
      // Keep the previous AST so the canvas doesn't flash to empty between
      // keystrokes. Just surface the parse error so the YAML pane can mark it.
      const msg = e instanceof Error ? e.message : String(e);
      const lineMatch = msg.match(/line (\d+)/);
      return {
        yaml,
        vibe: this.state?.vibe ?? { workflow: { id: "", steps: [] } },
        issues: this.state?.issues ?? [],
        parseError: {
          message: msg,
          line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
        },
        lastSource: source,
      };
    }
  }

  private emit() {
    for (const s of this.subs) s(this.state);
  }
}
