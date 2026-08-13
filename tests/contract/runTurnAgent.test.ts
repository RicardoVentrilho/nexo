import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { RunTurn } from "../../apps/api/src/slices/conversation/application/runTurn.js";
import type { McpClient } from "../../apps/api/src/slices/conversation/infrastructure/mcpClient.js";
import type { SessionState } from "../../apps/api/src/slices/conversation/infrastructure/sessionStore.js";
import { createSlotSet } from "../../apps/api/src/slices/conversation/domain/slots.js";

describe("RunTurn agent loop", () => {
  it("does not give OpenAI a tool list or let it choose MCP calls", async () => {
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const mcpClient: McpClient = {
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        return {
          candidates: [],
          widened: false
        };
      }
    };
    const openAiCalls: unknown[] = [];
    const openAi = fakeOpenAi([
      { content: "Nao encontrei uma aplicacao correspondente." }
    ], openAiCalls);

    await new RunTurn(mcpClient, openAi, "test-model").execute(testSession(), "quais marcas voces tem?");

    expect(mcpCalls.map((call) => call.name)).toEqual(["resolve_vehicle"]);
    expect(openAiCalls).toHaveLength(2);
    for (const call of openAiCalls) {
      expect(call).not.toHaveProperty("tools");
      expect(call).not.toHaveProperty("tool_choice");
    }
  });

  it("treats former selection commands as ordinary user text", async () => {
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
      { content: "Escolha uma aplicacao pelos cards." },
      { content: "Nao encontrei uma aplicacao correspondente." }
    ]);
    const runTurn = new RunTurn(mcpClient, openAi, "test-model");

    await runTurn.execute(session, "embreagem Cargo 1723");
    const selected = await runTurn.execute(session, "usar aplicacao 24951");

    expect(session.slotSet.slots.partTerm).toEqual({
      value: "usar aplicacao 24951",
      status: "stated",
      source: "user_text"
    });
    expect(session.currentApplicationId).toBeUndefined();
    expect(mcpCalls.at(-1)).toEqual({
      name: "resolve_vehicle",
      args: { catalog_id: "eaton", model: "usar aplicacao 24951", limit: 10 }
    });
    expect(selected.state).toBe("needs_choice");
  });
});

function testSession(): SessionState {
  return {
    sessionId: "local",
    principal: { subject: "user-1", displayName: "User", roles: ["user"] },
    slotSet: createSlotSet(),
    inFlight: false
  };
}

function fakeOpenAi(messages: Array<{ content: string | null; tool_calls?: unknown[] }>, calls: unknown[] = []): OpenAI {
  let index = 0;
  return {
    chat: {
      completions: {
        create: async (input: unknown) => {
          calls.push(input);
          return {
          choices: [{
            message: {
              role: "assistant",
              content: messages[index]?.content ?? "",
              tool_calls: messages[index++]?.tool_calls
            }
          }]
        };
        }
      }
    }
  } as unknown as OpenAI;
}
