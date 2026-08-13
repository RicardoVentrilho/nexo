import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { RunTurn } from "../../apps/api/src/slices/conversation/application/runTurn.js";
import type { McpClient } from "../../apps/api/src/slices/conversation/infrastructure/mcpClient.js";
import type { SessionState } from "../../apps/api/src/slices/conversation/infrastructure/sessionStore.js";

describe("RunTurn agent loop", () => {
  it("lets OpenAI request MCP tools and turns tool results into grounded cards", async () => {
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const mcpClient: McpClient = {
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        return {
          manufacturers: [
            { manufacturer_id: "2", name: "FORD", application_count: 1972 },
            { manufacturer_id: "4", name: "MERCEDES-BENZ", application_count: 1318 }
          ]
        };
      }
    };
    const openAi = fakeOpenAi([
      {
        content: null,
        tool_calls: [{
          id: "tool-1",
          type: "function",
          function: { name: "list_manufacturers", arguments: "{\"scope\":\"vehicle\",\"limit\":2}" }
        }]
      },
      { content: "Escolha uma marca pelos cards: [[card:1]]" }
    ]);

    const result = await new RunTurn(mcpClient, openAi, "test-model").execute(testSession(), "quais marcas voces tem?");

    expect(mcpCalls).toEqual([{ name: "list_manufacturers", args: { scope: "vehicle", limit: 2 } }]);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]?.kind).toBe("manufacturer");
    expect(result.prose).toContain("[[card:1]]");
  });

  it("uses the pending user query when a vehicle application card is selected", async () => {
    const session = testSession();
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const mcpClient: McpClient = {
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        if (name === "resolve_vehicle") {
          return {
            candidates: [
              { application_id: "13657", description: "CARGO 1723", year_text: "2007 ate 2019" },
              { application_id: "24951", description: "Caminhoes Cargo 1723", year_text: "" }
            ],
            widened: false
          };
        }
        return {
          parts: [{
            part_id: "177037",
            part_number: "177037",
            description: "EMBREAGEM",
            group: "Embreagem",
            subgroup: null,
            is_assembly: false,
            is_obsolete: false,
            has_photo: false
          }],
          total: 1
        };
      }
    };
    const openAi = fakeOpenAi([
      {
        content: null,
        tool_calls: [{
          id: "tool-1",
          type: "function",
          function: { name: "resolve_vehicle", arguments: "{\"model\":\"Cargo 1723\",\"limit\":2}" }
        }]
      },
      { content: "Aplicacoes disponiveis: 13657 e 24951." }
    ]);
    const runTurn = new RunTurn(mcpClient, openAi, "test-model");

    await runTurn.execute(session, "embreagem Cargo 1723");
    const selected = await runTurn.execute(session, "usar aplicacao 24951");

    expect(session.pendingPartQuery).toBe("embreagem Cargo 1723");
    expect(mcpCalls.at(-1)).toEqual({
      name: "search_parts",
      args: { query: "embreagem", application_id: "24951", limit: 5 }
    });
    expect(selected.cards[0]?.kind).toBe("part");
    expect(selected.prose).toContain("[[card:1]]");
  });
});

function testSession(): SessionState {
  return {
    sessionId: "local",
    principal: { subject: "user-1", displayName: "User", roles: ["user"] },
    inFlight: false
  };
}

function fakeOpenAi(messages: Array<{ content: string | null; tool_calls?: unknown[] }>): OpenAI {
  let index = 0;
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: messages[index]?.content ?? "",
              tool_calls: messages[index++]?.tool_calls
            }
          }]
        })
      }
    }
  } as unknown as OpenAI;
}
