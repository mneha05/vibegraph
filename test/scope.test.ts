import { describe, it, expect } from "vitest";
import { parseVibe } from "@/lib/vibe/parser";
import { analyzeScope } from "@/lib/vibe/scope";

describe("scope analyzer", () => {
  it("treats every step id as an addressable output", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: writer
      function: apiRequest
    - id: reader
      function: setVariable
      input:
        endpoint: \${steps.writer.output.token}
`);
    const scope = analyzeScope(v);
    // The step id itself is the address — ${steps.writer.…}
    expect(scope.get("writer")?.readers).toContain("reader");
  });

  it("also tracks explicit `output:` aliases", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: writer
      function: apiRequest
      output: token
`);
    const scope = analyzeScope(v);
    expect(scope.get("token")?.declaredAt?.kind).toBe("step_output");
  });

  it("collects readers across nested containers", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: producer
      function: apiRequest
    - id: outer
      iterable: \${steps.producer.output.rows}
      item: row
      body:
        - id: inner
          function: apiRequest
          input:
            endpoint: \${steps.producer.output.url}
`);
    const scope = analyzeScope(v);
    expect(scope.get("producer")?.readers).toContain("outer");
    expect(scope.get("producer")?.readers).toContain("inner");
    expect(scope.get("row")?.declaredAt?.kind).toBe("for_each_item");
  });

  it("does not flag secrets/uniqueData/system as variables", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: x
      function: apiRequest
      input:
        endpoint: \${secrets.token}
        body: \${uniqueData.payload}
        ts: \${system.timestamp}
`);
    const scope = analyzeScope(v);
    expect(scope.get("token")).toBeUndefined();
    expect(scope.get("payload")).toBeUndefined();
    expect(scope.get("timestamp")).toBeUndefined();
  });
});
