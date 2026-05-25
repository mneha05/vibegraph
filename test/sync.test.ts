import { describe, it, expect } from "vitest";
import { SyncEngine } from "@/lib/yaml/sync";
import { validateVibe } from "@/lib/vibe/validator";

const seed = `workflow:
  id: sync-test
  steps:
    - id: a
      function: setVariable
`;

describe("sync engine", () => {
  it("derives Vibe AST from YAML on init", () => {
    const e = new SyncEngine(seed, validateVibe);
    expect(e.getState().vibe.workflow.id).toBe("sync-test");
    expect(e.getState().vibe.workflow.steps).toHaveLength(1);
  });

  it("setVibe re-emits YAML", () => {
    const e = new SyncEngine(seed, validateVibe);
    const v = e.getState().vibe;
    const mutated = {
      workflow: { ...v.workflow, steps: [...v.workflow.steps, { kind: "step" as const, id: "b", function: "noop" }] },
    };
    e.setVibe(mutated);
    expect(e.getState().yaml).toContain("id: b");
    expect(e.getState().yaml).toContain("function: noop");
  });

  it("setYaml notifies subscribers", () => {
    const e = new SyncEngine(seed, validateVibe);
    let calls = 0;
    e.subscribe(() => calls++);
    e.setYaml(seed + "    - id: c\n      function: setVariable\n");
    expect(calls).toBeGreaterThan(0);
    expect(e.getState().vibe.workflow.steps).toHaveLength(2);
  });

  it("preserves previous AST on parse error", () => {
    const e = new SyncEngine(seed, validateVibe);
    e.setYaml("workflow:\n  id: bad\n  steps:\n    - id: a\n   bad-indent: nope\n");
    expect(e.getState().parseError).toBeDefined();
    // Previous AST still present.
    expect(e.getState().vibe.workflow.steps).toHaveLength(1);
  });
});
