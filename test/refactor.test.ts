import { describe, it, expect } from "vitest";
import { parseVibe } from "@/lib/vibe/parser";
import { renameStepReferences, stripStepReferences } from "@/lib/vibe/references";
import type { StepNode } from "@/lib/vibe/schema";

/**
 * These tests exercise the refactoring primitives the store wires into the
 * Inspector's "rename" and "delete" actions. They cover the same surface
 * the reference editor's flagship feature does (rename a step → every
 * caller auto-updates) and the dual on delete.
 */

describe("rename propagation", () => {
  it("rewrites every ${steps.OLD.…} reference in a real Vibe", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: lookup
      function: apiRequest
      output: profile
    - id: send
      function: sendResponse
      input:
        body:
          name: \${steps.lookup.output.name}
          fallback: \${steps.lookup}
`);
    // Treat lookup → fetch_profile.
    const send = v.workflow.steps.find((s) => s.id === "send") as StepNode;
    const renamed = renameStepReferences(send.input, "lookup", "fetch_profile");
    const dumped = JSON.stringify(renamed);
    expect(dumped).not.toContain("lookup");
    expect(dumped).toContain("fetch_profile");
  });

  it("is a no-op when old === new", () => {
    const v = { a: "${steps.x.output}", b: "${steps.x}" };
    expect(renameStepReferences(v, "x", "x")).toBe(v);
  });
});

describe("delete cleanup", () => {
  it("strips fields that exclusively reference the deleted step", () => {
    const input = {
      keep: "constant",
      derived: "${steps.gone.output.value}",
      nested: {
        also_gone: "${steps.gone.output.token}",
        survives: "static",
      },
    };
    const stripped = stripStepReferences(input, "gone") as Record<string, unknown>;
    expect(stripped).toEqual({
      keep: "constant",
      nested: { survives: "static" },
    });
  });

  it("preserves entries that reference a different step", () => {
    const input = {
      a: "${steps.gone.x}",
      b: "${steps.alive.x}",
    };
    const stripped = stripStepReferences(input, "gone") as Record<string, unknown>;
    expect(stripped.a).toBeUndefined();
    expect(stripped.b).toBe("${steps.alive.x}");
  });
});
