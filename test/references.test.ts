import { describe, it, expect } from "vitest";
import {
  findReferences,
  renameStepReferences,
  stripStepReferences,
} from "@/lib/vibe/references";

describe("references — grammar", () => {
  it("finds ${steps.X.…} references", () => {
    const refs = findReferences("Hello ${steps.normalize_request.output.value.name}!");
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe("step_output");
    expect(refs[0].name).toBe("normalize_request");
  });

  it("finds ${secrets.X}, ${uniqueData.X}, ${system.X}", () => {
    const refs = findReferences({
      authz: "Bearer ${secrets.token}",
      msg: "${uniqueData.body}",
      t: "${system.timestamp}",
    });
    const kinds = refs.map((r) => r.kind).sort();
    expect(kinds).toEqual(["secret", "system", "unique_data"]);
  });

  it("finds $shorthand variables without confusing them with ${…}", () => {
    const refs = findReferences("Use $my_var with ${steps.foo.output}");
    const varRef = refs.find((r) => r.kind === "variable");
    const stepRef = refs.find((r) => r.kind === "step_output");
    expect(varRef?.name).toBe("my_var");
    expect(stepRef?.name).toBe("foo");
  });

  it("renames ${steps.OLD.…} → ${steps.NEW.…} recursively", () => {
    const v = {
      a: "Bearer ${steps.lookup.output.token}",
      b: { c: "${steps.lookup.output.id}" },
      d: ["${steps.lookup}", "untouched"],
    };
    const renamed = renameStepReferences(v, "lookup", "fetchUser");
    expect(JSON.stringify(renamed)).not.toContain("lookup");
    expect(JSON.stringify(renamed)).toContain("fetchUser");
    // The untouched string survived.
    expect((renamed as { d: string[] }).d[1]).toBe("untouched");
  });

  it("strips fields whose values reference a deleted step", () => {
    const v = {
      keep_me: "raw value",
      delete_me: "${steps.gone.output.x}",
      nested: {
        also_delete: "${steps.gone.output.y}",
        survivor: "static",
      },
    };
    const stripped = stripStepReferences(v, "gone") as Record<string, unknown>;
    expect(stripped).toEqual({
      keep_me: "raw value",
      nested: { survivor: "static" },
    });
  });
});
