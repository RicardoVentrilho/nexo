import type OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunTurn } from "../../apps/api/src/slices/conversation/application/runTurn.js";
import { createSlotSet } from "../../apps/api/src/slices/conversation/domain/slots.js";
import type { McpClient } from "../../apps/api/src/slices/conversation/infrastructure/mcpClient.js";
import type { SessionState } from "../../apps/api/src/slices/conversation/infrastructure/sessionStore.js";

const telemetry = vi.hoisted(() => ({
  spans: [] as Array<Record<string, unknown>>
}));

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: () => ({
      startSpan: (name: string) => {
        const attributes: Record<string, unknown> = { name };
        telemetry.spans.push(attributes);
        return {
          setAttribute: (key: string, value: unknown) => {
            attributes[key] = value;
          },
          end: () => {}
        };
      }
    })
  }
}));

describe("slot-driven funnel", () => {
  beforeEach(() => {
    telemetry.spans.length = 0;
  });

  it("answers a fully specified sentence without asking a question", async () => {
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const mcpClient: McpClient = {
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        if (name === "resolve_vehicle") {
          return {
            candidates: [{
              application_id: "16049",
              description: "Cargo 2422 6x4",
              year_text: "Todos",
              part_count: 18
            }],
            widened: false
          };
        }
        return {
          parts: [{
            part_id: "104109-8",
            part_number: "104109-8",
            description: "Kit 365mm (P/ Tubo Guia)",
            group: "Embreagens",
            subgroup: "Conjunto Veicular",
            is_assembly: false,
            is_obsolete: false,
            has_photo: false
          }],
          total: 1
        };
      }
    };
    const openAi = fakeOpenAi([
      JSON.stringify({
        manufacturer: "Ford",
        model: "Cargo 2422",
        variant: "6x4",
        partTerm: "embreagem"
      }),
      "Veja os cards encontrados: [[card:1]]"
    ]);

    const result = await new RunTurn(mcpClient, openAi, "test-model").execute(
      testSession(),
      "Preciso de embreagem para Ford Cargo 2422 6x4"
    );

    expect(mcpCalls).toEqual([
      {
        name: "resolve_vehicle",
        args: { catalog_id: "eaton", manufacturer: "Ford", model: "Cargo 2422 6x4", limit: 10 }
      },
      {
        name: "search_parts",
        args: { query: "embreagem", application_id: "16049", limit: 5 }
      }
    ]);
    expect(result.state).toBe("released");
    expect(result.question).toBeUndefined();
    expect(result.cards.map((card) => card.kind)).toEqual(["part"]);
    expect(result.prose).toContain("[[card:1]]");
  });

  it("uses the top ranked candidate when a fully specified vehicle still has catalog duplicates", async () => {
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const mcpClient: McpClient = {
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        if (name === "resolve_vehicle") {
          return {
            candidates: [
              { application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 },
              { application_id: "6075", description: "Caminhoes Cargo 2422 6x4", year_text: "", part_count: 2 }
            ],
            widened: false
          };
        }
        return {
          parts: [{
            part_id: "104109-8",
            part_number: "104109-8",
            description: "Kit 365mm",
            group: "Embreagens",
            subgroup: "Conjunto Veicular",
            is_assembly: false,
            is_obsolete: false,
            has_photo: false
          }],
          total: 1
        };
      }
    };

    const result = await new RunTurn(mcpClient, fakeOpenAi([
      JSON.stringify({ manufacturer: "Ford", model: "Cargo 2422", variant: "6x4", partTerm: "embreagem" }),
      "Veja os cards encontrados: [[card:1]]"
    ]), "test-model").execute(testSession(), "Preciso de embreagem para Ford Cargo 2422 6x4");

    expect(mcpCalls.at(-1)).toEqual({
      name: "search_parts",
      args: { query: "embreagem", application_id: "16049", limit: 5 }
    });
    expect(result.state).toBe("released");
    expect(result.question).toBeUndefined();
    expect(result.cards.map((card) => card.kind)).toEqual(["part"]);
  });

  it("asks for the discriminator when multiple candidates can be reduced", async () => {
    const mcpClient: McpClient = {
      async callTool() {
        return {
          candidates: [
            { application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 },
            { application_id: "16047", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 8 },
            { application_id: "16048", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 6 }
          ],
          widened: false
        };
      }
    };
    const openAi = fakeOpenAi([
      JSON.stringify({
        model: "Cargo 2422",
        partTerm: "embreagem"
      }),
      "Qual opcao corresponde ao veiculo?"
    ]);

    const result = await new RunTurn(mcpClient, openAi, "test-model").execute(
      testSession(),
      "embreagem para Cargo 2422"
    );

    expect(result.state).toBe("needs_input");
    expect(result.question).toEqual({
      attribute: "description_token",
      options: [{ value: "6x2", label: "6x2" }, { value: "6x4", label: "6x4" }],
      skippable: true
    });
    expect(result.cards).toEqual([]);
  });

  it("falls back to candidate choice with a vehicle_ambiguous notice after the question budget", async () => {
    const session = testSession();
    session.slotSet.questionsAsked = 2;
    const mcpClient: McpClient = {
      async callTool() {
        return {
          candidates: [
            { application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 },
            { application_id: "16047", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 8 },
            { application_id: "16048", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 6 }
          ],
          widened: false
        };
      }
    };
    const openAi = fakeOpenAi([
      JSON.stringify({ model: "Cargo 2422", partTerm: "embreagem" }),
      "Escolha uma das opcoes."
    ]);

    const result = await new RunTurn(mcpClient, openAi, "test-model").execute(session, "embreagem para Cargo 2422");

    expect(result.state).toBe("needs_choice");
    expect(result.notices).toContainEqual({
      code: "vehicle_ambiguous",
      message: "Limite de perguntas atingido; escolha uma aplicacao para continuar."
    });
    expect(result.cards.map((card) => card.kind)).toEqual(["vehicle_candidate", "vehicle_candidate", "vehicle_candidate"]);
  });

  it("accepts a skipped question and continues with the unreduced candidates", async () => {
    const session = testSession();
    const candidates = [
      { application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 },
      { application_id: "16047", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 8 },
      { application_id: "16048", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 6 }
    ];
    const mcpClient: McpClient = {
      async callTool() {
        return { candidates, widened: false };
      }
    };
    const runTurn = new RunTurn(mcpClient, fakeOpenAi([
      JSON.stringify({ model: "Cargo 2422", partTerm: "embreagem" }),
      "Qual opcao corresponde ao veiculo?",
      JSON.stringify({}),
      "Escolha uma das opcoes."
    ]), "test-model");

    await runTurn.execute(session, "embreagem para Cargo 2422");
    const skipped = await runTurn.execute(session, "nao sei");

    expect(session.slotSet.declinedAttributes).toContain("description_token");
    expect(skipped.state).toBe("needs_choice");
    expect(skipped.notices).toContainEqual({
      code: "question_skipped",
      message: "Pergunta ignorada; resultado cobre mais de uma versao de veiculo."
    });
    expect(skipped.cards.map((card) => card.kind)).toEqual(["vehicle_candidate", "vehicle_candidate", "vehicle_candidate"]);
  });

  it("uses retained details when the user corrects one vehicle attribute", async () => {
    const session = testSession();
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const mcpClient: McpClient = {
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        if (name === "resolve_vehicle") {
          const model = (args as { model?: string }).model;
          return {
            candidates: [{
              application_id: model?.includes("6x2") ? "16047" : "16049",
              description: model?.includes("6x2") ? "Cargo 2422 6x2" : "Cargo 2422 6x4",
              year_text: "Todos",
              part_count: model?.includes("6x2") ? 8 : 18
            }],
            widened: false
          };
        }
        return {
          parts: [{
            part_id: "104109-8",
            part_number: "104109-8",
            description: "Kit 365mm",
            group: "Embreagens",
            subgroup: "Conjunto Veicular",
            is_assembly: false,
            is_obsolete: false,
            has_photo: false
          }],
          total: 1
        };
      }
    };
    const runTurn = new RunTurn(mcpClient, fakeOpenAi([
      JSON.stringify({ manufacturer: "Ford", model: "Cargo 2422", variant: "6x4", partTerm: "embreagem" }),
      "Veja os cards encontrados: [[card:1]]",
      JSON.stringify({ variant: "6x2" }),
      "Veja os cards encontrados: [[card:1]]"
    ]), "test-model");

    await runTurn.execute(session, "embreagem para Ford Cargo 2422 6x4");
    const corrected = await runTurn.execute(session, "na verdade e 6x2");

    expect(mcpCalls.at(-2)).toEqual({
      name: "resolve_vehicle",
      args: { catalog_id: "eaton", manufacturer: "Ford", model: "Cargo 2422 6x2", limit: 10 }
    });
    expect(mcpCalls.at(-1)).toEqual({
      name: "search_parts",
      args: { query: "embreagem", application_id: "16047", limit: 5 }
    });
    expect(corrected.state).toBe("released");
    expect(corrected.question).toBeUndefined();
  });

  it("distinguishes vehicle failures from part-term failures", async () => {
    const noVehicle = await new RunTurn({
      async callTool(name) {
        if (name === "resolve_vehicle") return { candidates: [], widened: false };
        return { parts: [], total: 0 };
      }
    }, fakeOpenAi([
      JSON.stringify({ manufacturer: "Fiat", model: "Uno", year: 2010, partTerm: "embreagem" }),
      "Veiculo nao encontrado."
    ]), "test-model").execute(testSession(), "embreagem para Fiat Uno 2010");

    const noPart = await new RunTurn({
      async callTool(name) {
        if (name === "resolve_vehicle") {
          return {
            candidates: [{ application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 }],
            widened: false
          };
        }
        return { parts: [], total: 0 };
      }
    }, fakeOpenAi([
      JSON.stringify({ manufacturer: "Ford", model: "Cargo 2422", variant: "6x4", partTerm: "banana" }),
      "Termo de peca sem resultado."
    ]), "test-model").execute(testSession(), "banana para Ford Cargo 2422 6x4");

    expect(noVehicle.notices).toContainEqual({
      code: "no_results",
      message: "Veiculo nao encontrado no catalogo."
    });
    expect(noPart.notices).toContainEqual({
      code: "no_results",
      message: "Peca nao encontrada para o veiculo identificado."
    });
  });

  it("refuses an explicit unknown part number before asking vehicle questions", async () => {
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const result = await new RunTurn({
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        if (name === "get_part") throw new Error("MCP tool get_part failed: 400");
        return {
          candidates: [
            { application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 },
            { application_id: "16047", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 8 }
          ],
          widened: false
        };
      }
    }, fakeOpenAi([
      JSON.stringify({ model: "Cargo 2422", partTerm: "9999999" }),
      "Nao encontrei essa peca no catalogo."
    ]), "test-model").execute(testSession(), "Confirma que a peca 9999999 serve no Cargo 2422?");

    expect(mcpCalls).toEqual([
      { name: "get_part", args: { catalog_id: "eaton", part_number: "9999999" } }
    ]);
    expect(result.state).toBe("released");
    expect(result.question).toBeUndefined();
    expect(result.notices).toContainEqual({
      code: "no_results",
      message: "Peca nao encontrada no catalogo."
    });
    expect(result.prose).not.toContain("9999999");
  });

  it("offers existing manufacturers when the named manufacturer is absent", async () => {
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const result = await new RunTurn({
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        if (name === "list_manufacturers") {
          if ((args as { search?: string }).search) return { manufacturers: [] };
          return {
            manufacturers: [
              { manufacturer_id: "2", name: "FORD", application_count: 1972 },
              { manufacturer_id: "4", name: "MERCEDES-BENZ", application_count: 1318 }
            ]
          };
        }
        return { candidates: [], widened: false };
      }
    }, fakeOpenAi([
      JSON.stringify({ manufacturer: "Fiat", model: "Uno", year: 2010, partTerm: "embreagem" }),
      "Fabricante nao encontrado; veja opcoes do catalogo."
    ]), "test-model").execute(testSession(), "embreagem para Fiat Uno 2010");

    expect(mcpCalls.slice(1)).toEqual([
      { name: "list_manufacturers", args: { catalog_id: "eaton", scope: "vehicle", search: "Fiat", limit: 1 } },
      { name: "list_manufacturers", args: { catalog_id: "eaton", scope: "vehicle", limit: 10 } }
    ]);
    expect(result.cards.map((card) => card.kind)).toEqual(["manufacturer", "manufacturer"]);
  });

  it("reports a vehicle miss instead of offering manufacturers when the manufacturer exists", async () => {
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const result = await new RunTurn({
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        if (name === "list_manufacturers") {
          return {
            manufacturers: [{ manufacturer_id: "2", name: "FORD", application_count: 1972 }]
          };
        }
        return { candidates: [], widened: false };
      }
    }, fakeOpenAi([
      JSON.stringify({ manufacturer: "Ford", model: "Zeppelin 9999", year: 2030, partTerm: "embreagem" }),
      "Veiculo nao encontrado."
    ]), "test-model").execute(testSession(), "embreagem para Ford Zeppelin 9999 2030");

    expect(mcpCalls).toEqual([
      { name: "resolve_vehicle", args: { catalog_id: "eaton", manufacturer: "Ford", model: "Zeppelin 9999", year: 2030, limit: 10 } },
      { name: "list_manufacturers", args: { catalog_id: "eaton", scope: "vehicle", search: "Ford", limit: 1 } }
    ]);
    expect(result.state).toBe("released");
    expect(result.cards).toEqual([]);
    expect(result.notices).toContainEqual({
      code: "no_results",
      message: "Veiculo nao encontrado no catalogo."
    });
  });

  it("emits question telemetry with candidate counts before and after the answer", async () => {
    const session = testSession();
    const runTurn = new RunTurn({
      async callTool(_name, args) {
        const model = (args as { model?: string }).model ?? "";
        if (model.includes("6x4")) {
          return {
            candidates: [{ application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 }],
            widened: false
          };
        }
        return {
          candidates: [
            { application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 },
            { application_id: "16047", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 8 },
            { application_id: "16048", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 6 }
          ],
          widened: false
        };
      }
    }, fakeOpenAi([
      JSON.stringify({ model: "Cargo 2422", partTerm: "embreagem" }),
      "Qual opcao corresponde ao veiculo?",
      JSON.stringify({ variant: "6x4" }),
      "Veja os cards encontrados: [[card:1]]"
    ]), "test-model");

    await runTurn.execute(session, "embreagem para Cargo 2422");

    expect(telemetry.spans).toEqual([]);

    await runTurn.execute(session, "6x4");

    expect(telemetry.spans).toEqual([{
      name: "conversation.question",
      "conversation.question.attribute": "description_token",
      "conversation.question.candidate_count_before": 3,
      "conversation.question.candidate_count_after": 1
    }]);
  });

  it("treats a question answer as the asked attribute even if extraction would call it a part term", async () => {
    const session = testSession();
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const runTurn = new RunTurn({
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        const model = (args as { model?: string }).model ?? "";
        if (name === "resolve_vehicle" && model.includes("6x4")) {
          return {
            candidates: [{ application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 }],
            widened: false
          };
        }
        if (name === "resolve_vehicle") {
          return {
            candidates: [
              { application_id: "16049", description: "Cargo 2422 6x4", year_text: "Todos", part_count: 18 },
              { application_id: "16047", description: "Cargo 2422 6x2", year_text: "Todos", part_count: 8 }
            ],
            widened: false
          };
        }
        return {
          parts: [{
            part_id: "104109-8",
            part_number: "104109-8",
            description: "Kit 365mm",
            group: "Embreagens",
            subgroup: "Conjunto Veicular",
            is_assembly: false,
            is_obsolete: false,
            has_photo: false
          }],
          total: 1
        };
      }
    }, fakeOpenAi([
      JSON.stringify({ model: "Cargo 2422", partTerm: "embreagem" }),
      "Qual opcao corresponde ao veiculo?",
      JSON.stringify({ partTerm: "6x4" }),
      "Veja os cards encontrados: [[card:1]]"
    ]), "test-model");

    await runTurn.execute(session, "embreagem para Cargo 2422");
    const answered = await runTurn.execute(session, "6x4");

    expect(mcpCalls.at(-2)).toEqual({
      name: "resolve_vehicle",
      args: { catalog_id: "eaton", model: "Cargo 2422 6x4", limit: 10 }
    });
    expect(answered.state).toBe("released");
    expect(answered.cards.map((card) => card.kind)).toEqual(["part"]);
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
