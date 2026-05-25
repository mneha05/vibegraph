import { describe, it, expect } from "vitest";
import { parseVibe } from "@/lib/vibe/parser";
import { validateVibe } from "@/lib/vibe/validator";

describe("validator", () => {
  it("flags duplicate sibling ids", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: dup
      function: setVariable
    - id: dup
      function: setVariable
`);
    const issues = validateVibe(v);
    expect(issues.some((i) => i.message.includes("Duplicate id"))).toBe(true);
  });

  it("flags broken next_step_id refs", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: a
      function: setVariable
      next_step_id: ghost
`);
    const issues = validateVibe(v);
    expect(issues.some((i) => i.message.includes("does not exist"))).toBe(true);
  });

  it("flags broken ${steps.X.…} references in input", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: a
      function: apiRequest
      input:
        endpoint: \${steps.does_not_exist.output.url}
`);
    const issues = validateVibe(v);
    expect(
      issues.some(
        (i) =>
          i.message.includes("does_not_exist") &&
          i.severity === "error",
      ),
    ).toBe(true);
  });

  it("does NOT flag references to extant steps", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: producer
      function: apiRequest
    - id: consumer
      function: apiRequest
      input:
        endpoint: \${steps.producer.output.url}
`);
    const issues = validateVibe(v);
    expect(issues.find((i) => i.message.includes("producer"))).toBeUndefined();
  });

  it("does NOT flag secrets/uniqueData as undeclared", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: a
      function: apiRequest
      input:
        endpoint: \${uniqueData.url}
        auth: \${secrets.token}
`);
    const issues = validateVibe(v);
    expect(issues.find((i) => i.message.includes("token"))).toBeUndefined();
    expect(issues.find((i) => i.message.includes("url"))).toBeUndefined();
  });

  it("detects unreachable top-level steps", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: a
      function: setVariable
      next_step_id: c
    - id: orphan
      function: setVariable
    - id: c
      function: setVariable
`);
    const issues = validateVibe(v);
    expect(
      issues.some((i) => i.nodeId === "orphan" && i.message.includes("unreachable")),
    ).toBe(true);
  });

  it("warns on empty `if.then`", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: branch
      condition: \$x
      then: []
`);
    const issues = validateVibe(v);
    expect(issues.some((i) => i.message.includes("empty"))).toBe(true);
  });
});
