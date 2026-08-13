import { describe, expect, it } from "vitest";
import { validateGrounding } from "../../apps/api/src/slices/conversation/application/validateGrounding.js";

describe("grounding validator", () => {
  it("replaces prose that contains a catalog identifier not present in any card", () => {
    const result = validateGrounding("A peca inventada e MX-99-9999.", []);

    expect(result.prose).not.toContain("MX-99-9999");
    expect(result.notices).toContainEqual({
      code: "grounding_violation",
      message: "Resposta textual continha identificador sem card de origem."
    });
  });

  it("replaces prose that leaks a card identifier instead of using a card reference", () => {
    const result = validateGrounding("Escolha a aplicacao 13657.", [{
      cardId: 1,
      kind: "vehicle_candidate",
      sourceToolCall: "resolve_vehicle",
      payload: {
        application_id: "13657",
        description: "CARGO 1723",
        year_text: "2007 ate 2019"
      }
    }]);

    expect(result.prose).not.toContain("13657");
    expect(result.notices).toContainEqual({
      code: "grounding_violation",
      message: "Resposta textual continha identificador sem card de origem."
    });
  });
});
