import { describe, it, expect } from "vitest";
import { parseVibe } from "@/lib/vibe/parser";
import { buildGraph } from "@/lib/vibe/graph";

describe("graph builder", () => {
  it("nests if-branch children logically (parentId in data)", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: branch
      condition: $x
      then:
        - id: t1
          function: setVariable
      else:
        - id: e1
          function: setVariable
`);
    const { nodes, edges } = buildGraph(v);
    const t1 = nodes.find((n) => n.id === "t1");
    const e1 = nodes.find((n) => n.id === "e1");
    expect((t1?.data as { parentId?: string })?.parentId).toBe("branch");
    expect((e1?.data as { parentId?: string })?.parentId).toBe("branch");
    expect(edges.some((e) => e.label === "then")).toBe(true);
    expect(edges.some((e) => e.label === "else")).toBe(true);
  });

  it("emits loop_back edges for for_each", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: loop
      iterable: $items
      item: r
      body:
        - id: body1
          function: setVariable
`);
    const { edges } = buildGraph(v);
    expect(
      edges.some(
        (e) => (e.data as { kind?: string })?.kind === "loop_back" && e.target === "loop",
      ),
    ).toBe(true);
  });

  it("creates fall-through edges between sibling steps", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: a
      function: setVariable
    - id: b
      function: setVariable
`);
    const { edges } = buildGraph(v);
    expect(
      edges.some(
        (e) => e.source === "a" && e.target === "b" && (e.data as { kind?: string })?.kind === "fall_through",
      ),
    ).toBe(true);
  });

  it("emits dashed error edges for on_error_step_id", () => {
    const v = parseVibe(`
workflow:
  id: t
  steps:
    - id: risky
      function: apiRequest
      on_error_step_id: handler
    - id: handler
      function: setVariable
`);
    const { edges } = buildGraph(v);
    expect(edges.some((e) => e.type === "error" && e.target === "handler")).toBe(true);
  });
});
