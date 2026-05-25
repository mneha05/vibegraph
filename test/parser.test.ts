import { describe, it, expect } from "vitest";
import { parseVibe } from "@/lib/vibe/parser";
import { serializeVibe } from "@/lib/vibe/serializer";

describe("parser", () => {
  it("parses a minimal vibe", () => {
    const v = parseVibe(`workflow:\n  id: tiny\n  steps: []\n`);
    expect(v.workflow.id).toBe("tiny");
    expect(v.workflow.steps).toEqual([]);
  });

  it("infers `if` kind from condition + then shape", () => {
    const yaml = `
workflow:
  id: t
  steps:
    - id: branch
      condition: $x
      then:
        - id: a
          function: setVariable
`;
    const v = parseVibe(yaml);
    expect(v.workflow.steps[0].kind).toBe("if");
  });

  it("infers `for_each` from iterable + item", () => {
    const yaml = `
workflow:
  id: t
  steps:
    - id: loop
      iterable: $items
      item: it
      body:
        - id: a
          function: setVariable
`;
    const v = parseVibe(yaml);
    expect(v.workflow.steps[0].kind).toBe("for_each");
  });

  it("round-trips a Vibe with a conditional", () => {
    const original = `workflow:\n  id: rt\n  steps:\n    - id: a\n      function: setVariable\n    - id: b\n      condition: $a\n      then:\n        - id: c\n          function: setVariable\n`;
    const reSerialized = serializeVibe(parseVibe(original));
    const reParsed = parseVibe(reSerialized);
    expect(reParsed.workflow.id).toBe("rt");
    expect(reParsed.workflow.steps).toHaveLength(2);
    expect(reParsed.workflow.steps[1].kind).toBe("if");
  });

  it("throws on a non-mapping document", () => {
    expect(() => parseVibe("- just a list\n- not a mapping")).toThrow();
  });
});
