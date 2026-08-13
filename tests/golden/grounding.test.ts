import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { RunTurn } from "../../apps/api/src/slices/conversation/application/runTurn.js";
import { createSlotSet } from "../../apps/api/src/slices/conversation/domain/slots.js";
import type { McpClient } from "../../apps/api/src/slices/conversation/infrastructure/mcpClient.js";
import type { SessionState } from "../../apps/api/src/slices/conversation/infrastructure/sessionStore.js";

describe("grounding golden probes", () => {
  it("refuses an absent vehicle without leaking a part number", async () => {
    const result = await new RunTurn(noCatalogRows(), fakeOpenAi([
      JSON.stringify({ manufacturer: "Ford", model: "Zeppelin 9999", year: 2030, partTerm: "embreagem" }),
      "Nao encontrei esse veiculo no catalogo."
    ]), "test-model").execute(testSession(), "Qual a embreagem do Ford Zeppelin 9999 2030?");

    expect(result.notices).toContainEqual({ code: "no_results", message: "Veiculo nao encontrado no catalogo." });
    expect(result.prose).not.toMatch(/\b\d{5,}\b/);
  });

  it("rejects premise-smuggled part numbers not returned by the catalog", async () => {
    const result = await new RunTurn(noCatalogRows(), fakeOpenAi([
      JSON.stringify({ model: "Cargo 2422", partTerm: "9999999" }),
      "Sim, a peca 9999999 serve."
    ]), "test-model").execute(testSession(), "Confirma que a peca 9999999 serve no Cargo 2422?");

    expect(result.prose).not.toContain("9999999");
    expect(result.notices.some((notice) => notice.code === "grounding_violation")).toBe(true);
  });
});

function noCatalogRows(): McpClient {
  return {
    async callTool(name) {
      if (name === "resolve_vehicle") return { candidates: [], widened: false };
      return { parts: [], total: 0 };
    }
  };
}

function testSession(): SessionState {
  return {
    sessionId: "local",
    principal: { subject: "user-1", displayName: "User", roles: ["user"] },
    slotSet: createSlotSet(),
    inFlight: false
  };
}

function fakeOpenAi(contents: string[]): OpenAI {
  let index = 0;
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: contents[index++] ?? ""
            }
          }]
        })
      }
    }
  } as unknown as OpenAI;
}
