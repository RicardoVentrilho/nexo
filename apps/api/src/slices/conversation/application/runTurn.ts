import { randomUUID } from "node:crypto";
import type { TurnResponse } from "@nexo/contracts/api";
import type OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from "openai/resources/chat/completions";
import { GroundingLedger } from "../domain/ledger.js";
import type { McpClient } from "../infrastructure/mcpClient.js";
import { createOpenAiClient, getOpenAiModel } from "../infrastructure/openAiClient.js";
import type { SessionState } from "../infrastructure/sessionStore.js";
import { validateGrounding } from "./validateGrounding.js";

export class RunTurn {
  constructor(
    private readonly mcpClient: McpClient,
    private readonly openAi: OpenAI = createOpenAiClient(),
    private readonly model: string = getOpenAiModel()
  ) {}

  async execute(session: SessionState, message: string): Promise<TurnResponse> {
    const ledger = new GroundingLedger();
    const turnId = randomUUID();
    const selectedApplication = message.match(/usar aplicacao (?<id>\S+)/i)?.groups?.id;
    if (selectedApplication) {
      session.currentApplicationId = selectedApplication;
      const query = session.pendingPartQuery;
      if (query) {
        const partQuery = extractPartQuery(query);
        const args = { query: partQuery, application_id: selectedApplication, limit: 5 };
        let result = await this.callToolCapped("search_parts", args, 1);
        appendToolResultToLedger(ledger, "search_parts", args, result, "released");
        if (ledger.list().length === 0) {
          result = await this.searchOtherCandidateApplications(session, selectedApplication, partQuery, ledger);
        }
        const cards = ledger.list();
        const validation = validateGrounding(cards.length > 0 ? "Veja os cards encontrados: [[card:1]]" : "Nao encontrei uma peca correspondente no catalogo.", cards);
        return {
          turnId,
          prose: validation.prose,
          cards,
          notices: cards.length === 0 ? [{ code: "no_results", message: "Nenhuma peca encontrada." }, ...validation.notices] : validation.notices,
          state: "released"
        };
      }
    }
    const isSelectionCommand = Boolean(selectedApplication) || /^usar (fabricante|modelo) /i.test(message);
    if (!isSelectionCommand) session.pendingPartQuery = message;
    const selectedManufacturer = message.match(/usar fabricante (?<id>\S+)/i)?.groups?.id;
    if (selectedManufacturer) {
      session.currentManufacturerId = selectedManufacturer;
      const args = { manufacturer_id: selectedManufacturer, limit: 25 };
      const result = await this.callToolCapped("list_vehicle_models", args, 1);
      appendToolResultToLedger(ledger, "list_vehicle_models", args, result, "released");
      const validation = validateGrounding("Escolha um dos modelos encontrados para continuar.", ledger.list());
      return {
        turnId,
        prose: validation.prose,
        cards: ledger.list(),
        notices: validation.notices,
        state: "needs_choice"
      };
    }

    const selectedModel = message.match(/usar modelo (?<manufacturerId>\S+) (?<model>.+)$/i)?.groups;
    if (selectedModel?.manufacturerId && selectedModel.model) {
      session.currentManufacturerId = selectedModel.manufacturerId;
      session.currentVehicleModel = selectedModel.model;
      const args = { manufacturer_id: selectedModel.manufacturerId, model: selectedModel.model, limit: 10 };
      const result = await this.callToolCapped("resolve_vehicle", args, 1);
      const state = appendToolResultToLedger(ledger, "resolve_vehicle", args, result, "released");
      const validation = validateGrounding("Escolha uma aplicacao de veiculo para continuar.", ledger.list());
      return {
        turnId,
        prose: validation.prose,
        cards: ledger.list(),
        notices: validation.notices,
        state
      };
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt(session.currentApplicationId) },
      { role: "user", content: message }
    ];
    let state: TurnResponse["state"] = "released";

    for (let round = 1; round <= 4; round += 1) {
      const completion = await this.openAi.chat.completions.create({
        model: this.model,
        temperature: 0.1,
        messages,
        tools,
        tool_choice: "auto"
      });
      const assistantMessage = completion.choices[0]?.message;
      if (!assistantMessage) break;
      messages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls ?? [];
      if (toolCalls.length === 0) {
        if (state === "needs_choice") {
          const validation = validateGrounding(choiceProse(ledger.list().length), ledger.list());
          return {
            turnId,
            prose: validation.prose,
            cards: ledger.list(),
            notices: validation.notices,
            state
          };
        }
        const validation = validateGrounding(assistantMessage.content ?? fallbackProse(ledger.list().length), ledger.list());
        return {
          turnId,
          prose: validation.prose,
          cards: ledger.list(),
          notices: validation.notices,
          state
        };
      }

      for (const toolCall of toolCalls) {
        const args = parseToolArguments(toolCall.function.arguments);
        const result = await this.callToolCapped(toolCall.function.name, args, round);
        updateSessionFromToolResult(session, toolCall.function.name, result);
        state = appendToolResultToLedger(ledger, toolCall.function.name, args, result, state);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    messages.push({
      role: "system",
      content: "Finalize a resposta agora usando somente os cards ja retornados. Se faltarem dados, diga o que falta sem inventar."
    });
    const finalCompletion = await this.openAi.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      messages
    });
    const cards = ledger.list();
    const prose = state === "needs_choice" ? choiceProse(cards.length) : finalCompletion.choices[0]?.message.content ?? fallbackProse(cards.length);
    const validation = validateGrounding(prose, cards);

    return {
      turnId,
      prose: validation.prose,
      cards,
      notices: cards.length === 0 ? [{ code: "no_results", message: "Nenhuma peca encontrada." }, ...validation.notices] : validation.notices,
      state
    };
  }

  private async callToolCapped(name: string, args: unknown, round: number): Promise<unknown> {
    if (round > 4) throw new Error("tool_round_limit_exceeded");
    return this.mcpClient.callTool(name, args);
  }

  private async searchOtherCandidateApplications(
    session: SessionState,
    selectedApplication: string,
    query: string,
    ledger: GroundingLedger
  ): Promise<unknown> {
    for (const candidate of session.lastVehicleCandidates ?? []) {
      if (!candidate.application_id || candidate.application_id === selectedApplication) continue;
      const args = { query, application_id: candidate.application_id, limit: 5 };
      const result = await this.callToolCapped("search_parts", args, 2);
      const parts = Array.isArray((result as { parts?: unknown[] }).parts) ? (result as { parts: unknown[] }).parts : [];
      if (parts.length === 0) continue;
      appendToolResultToLedger(ledger, "vehicle_candidate", {}, { candidates: [candidate], widened: false }, "released");
      appendToolResultToLedger(ledger, "search_parts", args, result, "released");
      return result;
    }
    return { parts: [], total: 0 };
  }
}

function systemPrompt(currentApplicationId?: string): string {
  return [
    "Voce e o agente do catalogo de pecas Eaton.",
    "Use as ferramentas MCP para obter todo dado de catalogo; nunca invente codigo de peca, aplicacao, fabricante, kit ou referencia.",
    "Quando precisar resolver veiculo, chame resolve_vehicle. Quando souber a peca ou termo, chame search_parts. Use get_part, get_assemblies e find_cross_reference quando isso ajudar a responder.",
    "Na resposta final, cite resultados estruturados usando somente referencias [[card:N]]. Nao escreva numeros de peca soltos fora dos cards.",
    "Se houver multiplas aplicacoes possiveis, apresente a ambiguidade e peca que o usuario escolha um card.",
    currentApplicationId ? `Aplicacao de veiculo ja selecionada na sessao: ${currentApplicationId}. Use esse application_id em search_parts quando fizer sentido.` : ""
  ].filter(Boolean).join(" ");
}

function parseToolArguments(argumentsJson: string): unknown {
  try {
    return JSON.parse(argumentsJson || "{}") as unknown;
  } catch {
    return {};
  }
}

function updateSessionFromToolResult(session: SessionState, toolName: string, result: unknown): void {
  if (toolName !== "resolve_vehicle") return;
  const candidates = Array.isArray((result as { candidates?: unknown[] }).candidates)
    ? (result as { candidates: unknown[] }).candidates
    : [];
  session.lastVehicleCandidates = candidates
    .filter((candidate): candidate is { application_id?: string; description?: string; year_text?: string | null } => typeof candidate === "object" && candidate !== null)
    .map((candidate) => {
      const normalized: { application_id?: string; description?: string; year_text?: string | null } = {};
      if (typeof candidate.application_id === "string") normalized.application_id = candidate.application_id;
      if (typeof candidate.description === "string") normalized.description = candidate.description;
      if (typeof candidate.year_text === "string" || candidate.year_text === null) normalized.year_text = candidate.year_text;
      return normalized;
    });
  if (candidates.length !== 1) return;
  const applicationId = (candidates[0] as { application_id?: unknown } | undefined)?.application_id;
  if (typeof applicationId === "string") session.currentApplicationId = applicationId;
}

function appendToolResultToLedger(
  ledger: GroundingLedger,
  toolName: string,
  args: unknown,
  result: unknown,
  currentState: TurnResponse["state"]
): TurnResponse["state"] {
  if (toolName === "resolve_vehicle") {
    const candidates = Array.isArray((result as { candidates?: unknown[] }).candidates)
      ? (result as { candidates: unknown[] }).candidates
      : [];
    for (const candidate of candidates) ledger.append("vehicle_candidate", candidate as never, toolName);
    return candidates.length > 1 ? "needs_choice" : currentState;
  }

  if (toolName === "search_parts") {
    const parts = Array.isArray((result as { parts?: unknown[] }).parts) ? (result as { parts: unknown[] }).parts : [];
    for (const part of parts) ledger.append("part", part as never, toolName);
    return currentState;
  }

  if (toolName === "get_part") {
    ledger.append("part", result as never, toolName);
    return currentState;
  }

  if (toolName === "get_assemblies") {
    ledger.append("assembly", result as never, toolName);
    return currentState;
  }

  if (toolName === "find_cross_reference") {
    ledger.append("cross_reference", result as never, toolName);
    return currentState;
  }

  if (toolName === "list_manufacturers") {
    const manufacturers = Array.isArray((result as { manufacturers?: unknown[] }).manufacturers)
      ? (result as { manufacturers: unknown[] }).manufacturers
      : [];
    for (const manufacturer of manufacturers) ledger.append("manufacturer", manufacturer as never, toolName);
    return currentState;
  }

  if (toolName === "list_vehicle_models") {
    const models = Array.isArray((result as { models?: unknown[] }).models) ? (result as { models: unknown[] }).models : [];
    const manufacturerId = typeof (parseMaybeObject(args)?.manufacturer_id) === "string" ? String(parseMaybeObject(args)?.manufacturer_id) : undefined;
    for (const model of models) {
      ledger.append("vehicle_model", {
        ...(typeof model === "object" && model !== null ? model as Record<string, unknown> : {}),
        ...(manufacturerId ? { manufacturer_id: manufacturerId } : {})
      } as never, toolName);
    }
    return currentState;
  }

  if (toolName === "list_groups") {
    const groups = Array.isArray((result as { groups?: unknown[] }).groups) ? (result as { groups: unknown[] }).groups : [];
    for (const group of groups) ledger.append("group", group as never, toolName);
    return currentState;
  }

  return currentState;
}

function parseMaybeObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function fallbackProse(cardCount: number): string {
  return cardCount > 0 ? "Veja os cards encontrados: [[card:1]]" : "Nao encontrei uma peca correspondente no catalogo.";
}

function extractPartQuery(query: string): string {
  const words = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((word) => !/^\d+$/.test(word))
    .filter((word) => !["cargo", "caminhao", "caminhoes", "ford", "volkswagen", "mercedes", "benz", "volvo", "iveco", "scania"].includes(word.toLowerCase()));
  return words.join(" ").trim() || query;
}

function choiceProse(cardCount: number): string {
  const refs = Array.from({ length: cardCount }, (_, index) => `[[card:${index + 1}]]`).join(", ");
  return refs ? `Encontrei mais de uma opcao possivel. Escolha um dos cards para continuar: ${refs}.` : fallbackProse(0);
}

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_manufacturers",
      description: "Lista fabricantes existentes no catalogo para aplicacoes de veiculos ou referencias cruzadas.",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["vehicle", "cross_reference"] },
          search: { type: "string" },
          catalog_id: { type: "string", default: "eaton" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 50 }
        },
        required: ["scope"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_vehicle_models",
      description: "Lista modelos de veiculo de um fabricante do catalogo.",
      parameters: {
        type: "object",
        properties: {
          manufacturer_id: { type: "string" },
          search: { type: "string" },
          catalog_id: { type: "string", default: "eaton" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 25 }
        },
        required: ["manufacturer_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "resolve_vehicle",
      description: "Resolve um texto de veiculo em aplicacoes candidatas do catalogo.",
      parameters: {
        type: "object",
        properties: {
          model: { type: "string" },
          manufacturer_id: { type: "string" },
          manufacturer: { type: "string" },
          year: { type: "integer" },
          catalog_id: { type: "string", default: "eaton" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 10 }
        },
        required: ["model", "limit"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_parts",
      description: "Busca pecas por termo, numero, grupo ou aplicacao de veiculo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          application_id: { type: "string" },
          vehicle_text: { type: "string" },
          year: { type: "integer" },
          group_id: { type: "string" },
          catalog_id: { type: "string", default: "eaton" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 10 }
        },
        required: ["query", "limit"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_part",
      description: "Obtem detalhes de uma peca por part_id ou part_number.",
      parameters: {
        type: "object",
        properties: {
          part_id: { type: "string" },
          part_number: { type: "string" },
          catalog_id: { type: "string", default: "eaton" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_assemblies",
      description: "Lista conjuntos, componentes e itens do mesmo desenho relacionados a uma peca.",
      parameters: {
        type: "object",
        properties: {
          part_id: { type: "string" },
          catalog_id: { type: "string", default: "eaton" }
        },
        required: ["part_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_cross_reference",
      description: "Busca equivalencias Eaton a partir de numero estrangeiro de referencia cruzada.",
      parameters: {
        type: "object",
        properties: {
          foreign_number: { type: "string" },
          catalog_id: { type: "string", default: "eaton" }
        },
        required: ["foreign_number"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_groups",
      description: "Lista grupos ou subgrupos de produtos do catalogo.",
      parameters: {
        type: "object",
        properties: {
          parent_group_id: { type: ["string", "null"] },
          application_id: { type: "string" },
          catalog_id: { type: "string", default: "eaton" }
        },
        additionalProperties: false
      }
    }
  }
];
