import { describe, expect, it } from "vitest";
import { GetAssembliesOutput } from "../../packages/contracts/src/tools/getAssemblies.js";

describe("assembly contract", () => {
  it("treats empty same_drawing as a normal result", () => {
    const parsed = GetAssembliesOutput.parse({
      parent_assemblies: [],
      components: [],
      same_drawing: []
    });

    expect(parsed.same_drawing).toEqual([]);
  });
});
