import { randomUUID } from "node:crypto";
import type { Notice, Question, TurnResponse } from "@nexo/contracts/api";
import { trace } from "@opentelemetry/api";
import type OpenAI from "openai";
import { selectDiscriminator } from "../domain/discriminator.js";
import { transitionToAwaitingAnswer } from "../domain/funnel.js";
import { GroundingLedger } from "../domain/ledger.js";
import { extractPartQuery } from "../domain/partQuery.js";
import { confirmSlot, mergeStatedSlots, recordDeclinedAttribute, type StatedSlots } from "../domain/slots.js";
import type { McpClient } from "../infrastructure/mcpClient.js";
import { createOpenAiClient, getOpenAiModel } from "../infrastructure/openAiClient.js";
import type { SessionState } from "../infrastructure/sessionStore.js";
import { extractSlots } from "./extractSlots.js";
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
    if (session.awaitingQuestion && isDecline(message)) {
      session.slotSet = recordDeclinedAttribute(session.slotSet, session.awaitingQuestion.attribute);
      delete session.awaitingQuestion;
      const result = { candidates: session.lastVehicleCandidates ?? [], widened: false };
      recordPendingQuestionSpan(session, result.candidates.length);
      const state = appendToolResultToLedger(ledger, "resolve_vehicle", {}, result, "released");
      const cards = ledger.list();
      const validation = validateGrounding(choiceProse(cards.length), cards);
      return {
        turnId,
        prose: validation.prose,
        cards,
        notices: [
          { code: "question_skipped", message: "Pergunta ignorada; resultado cobre mais de uma versao de veiculo." },
          ...validation.notices
        ],
        state
      };
    }

    const extracted = session.awaitingQuestion ? slotsFromQuestionAnswer(session.awaitingQuestion, message) : await this.extractSlotsSafely(message);
    if (session.awaitingQuestion) {
      delete session.awaitingQuestion;
    }
    if (hasVehicleSlot(extracted)) {
      delete session.currentApplicationId;
    }
    session.slotSet = mergeStatedSlots(session.slotSet, Object.keys(extracted).length > 0 ? extracted : { partTerm: message });

    let state: TurnResponse["state"] = "released";
    let question: Question | undefined;
    const notices: Notice[] = [];
    let noResultsMessage = "Nenhuma peca encontrada.";
    const explicitPartNumber = explicitPartNumberFromSlot(session);
    if (!session.currentApplicationId && explicitPartNumber && await this.explicitPartMissing(explicitPartNumber)) {
      noResultsMessage = "Peca nao encontrada no catalogo.";
    } else if (session.currentApplicationId) {
      await this.searchPartsForApplication(session, session.currentApplicationId, ledger);
    } else {
      const args = vehicleResolutionArgs(session, message);
      const result = await this.callTool("resolve_vehicle", args);
      updateSessionFromToolResult(session, "resolve_vehicle", result);
      const candidates = candidateCount(result);
      recordPendingQuestionSpan(session, candidates);
      if (candidates === 1 && session.currentApplicationId) {
        session.slotSet = confirmSlot(session.slotSet, "model");
        await this.searchPartsForApplication(session, session.currentApplicationId, ledger);
        state = "released";
        if (ledger.list().length === 0) noResultsMessage = "Peca nao encontrada para o veiculo identificado.";
      } else {
        const topRankedApplicationId = candidates > 1 && hasFullySpecifiedPartRequest(session) ? uniqueTopRankedApplicationId(result) : undefined;
        if (topRankedApplicationId) {
          session.currentApplicationId = topRankedApplicationId;
          session.slotSet = confirmSlot(session.slotSet, "model");
          await this.searchPartsForApplication(session, topRankedApplicationId, ledger);
          state = "released";
          if (ledger.list().length === 0) noResultsMessage = "Peca nao encontrada para o veiculo identificado.";
        } else {
        if (candidates === 0) noResultsMessage = "Veiculo nao encontrado no catalogo.";
        const discriminator = selectDiscriminator(vehicleCandidates(result));
        if (candidates === 0 && stringSlotValue(session, "manufacturer")) {
          const manufacturer = stringSlotValue(session, "manufacturer") ?? "";
          const manufacturerExistsArgs = { catalog_id: "eaton", scope: "vehicle", search: manufacturer, limit: 1 };
          const manufacturerExistsResult = await this.callTool("list_manufacturers", manufacturerExistsArgs);
          if (manufacturerCount(manufacturerExistsResult) === 0) {
            const manufacturerArgs = { catalog_id: "eaton", scope: "vehicle", limit: 10 };
            const manufacturerResult = await this.callTool("list_manufacturers", manufacturerArgs);
            state = appendToolResultToLedger(ledger, "list_manufacturers", manufacturerArgs, manufacturerResult, state);
          }
        } else if (discriminator) {
          const transition = transitionToAwaitingAnswer(session.slotSet, discriminator);
          session.slotSet = transition.slotSet;
          if (transition.state === "awaiting_answer" && transition.question) {
            state = "needs_input";
            question = transition.question;
            session.awaitingQuestion = question;
            session.pendingQuestionTelemetry = {
              attribute: discriminator.attribute,
              candidateCountBefore: vehicleCandidates(result).length
            };
          } else {
            notices.push({
              code: "vehicle_ambiguous",
              message: "Limite de perguntas atingido; escolha uma aplicacao para continuar."
            });
            state = appendToolResultToLedger(ledger, "resolve_vehicle", args, result, state);
          }
        } else {
          state = appendToolResultToLedger(ledger, "resolve_vehicle", args, result, state);
        }
        }
      }
    }

    const cards = ledger.list();
    const composed = await this.composeProse(message, cards, state);
    const prose = state === "needs_choice" ? choiceProse(cards.length) : composed;
    const validation = validateGrounding(prose, cards);

    return {
      turnId,
      prose: validation.prose,
      cards,
      notices: [
        ...notices,
        ...(cards.length === 0 && state === "released" ? [{ code: "no_results" as const, message: noResultsMessage }] : []),
        ...validation.notices
      ],
      state,
      ...(question ? { question } : {})
    };
  }

  private async callTool(name: string, args: unknown): Promise<unknown> {
    return this.mcpClient.callTool(name, args);
  }

  private async extractSlotsSafely(message: string) {
    try {
      return await extractSlots(this.openAi, this.model, message);
    } catch {
      return {};
    }
  }

  private async searchPartsForApplication(session: SessionState, applicationId: string, ledger: GroundingLedger): Promise<void> {
    const query = stringSlotValue(session, "partTerm");
    if (!query) return;
    const args = { query: extractPartQuery(query), application_id: applicationId, limit: 5 };
    const result = await this.callTool("search_parts", args);
    appendToolResultToLedger(ledger, "search_parts", args, result, "released");
  }

  private async explicitPartMissing(partNumber: string): Promise<boolean> {
    try {
      await this.callTool("get_part", { catalog_id: "eaton", part_number: partNumber });
      return false;
    } catch (error) {
      if (isToolNotFound(error)) return true;
      throw error;
    }
  }

  private async composeProse(message: string, cards: TurnResponse["cards"], state: TurnResponse["state"]): Promise<string> {
    const completion = await this.openAi.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt(state) },
        {
          role: "user",
          content: JSON.stringify({
            message,
            state,
            cardCount: cards.length
          })
        }
      ]
    });
    return completion.choices[0]?.message.content ?? fallbackProse(cards.length);
  }
}

function stringSlotValue(session: SessionState, name: "manufacturer" | "model" | "variant" | "partTerm"): string | undefined {
  const value = session.slotSet.slots[name]?.value;
  return typeof value === "string" ? value : undefined;
}

function numericSlotValue(session: SessionState, name: "year"): number | undefined {
  const value = session.slotSet.slots[name]?.value;
  return typeof value === "number" ? value : undefined;
}

function explicitPartNumberFromSlot(session: SessionState): string | undefined {
  const partTerm = stringSlotValue(session, "partTerm");
  const match = partTerm?.match(/\b[\d.-]{5,}\b/);
  return match?.[0];
}

function isToolNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === "not_found" ||
    error.message.includes("MCP tool get_part failed: 400") ||
    error.message.includes("MCP tool get_part failed: 404") ||
    error.message.includes("MCP tool get_part failed: 500");
}

function vehicleResolutionArgs(session: SessionState, fallbackMessage: string): Record<string, string | number> {
  const model = stringSlotValue(session, "model");
  const variant = stringSlotValue(session, "variant");
  const manufacturer = stringSlotValue(session, "manufacturer");
  const year = numericSlotValue(session, "year");
  return {
    catalog_id: "eaton",
    ...(manufacturer ? { manufacturer } : {}),
    model: [model, variant].filter(Boolean).join(" ") || fallbackMessage,
    ...(year === undefined ? {} : { year }),
    limit: 10
  };
}

function hasVehicleSlot(slots: Record<string, unknown>): boolean {
  return slots.manufacturer !== undefined || slots.model !== undefined || slots.variant !== undefined || slots.year !== undefined;
}

function systemPrompt(state: TurnResponse["state"]): string {
  return [
    "Voce e o agente do catalogo de pecas Eaton.",
    "O codigo ja executou as consultas MCP necessarias antes desta mensagem.",
    "Na resposta final, cite resultados estruturados usando somente referencias [[card:N]]. Nao escreva numeros de peca soltos fora dos cards.",
    state === "needs_choice" ? "Ha multiplas aplicacoes possiveis; peca que o usuario escolha um card." : "",
    "Se faltarem dados, diga o que falta sem inventar."
  ].filter(Boolean).join(" ");
}

function updateSessionFromToolResult(session: SessionState, toolName: string, result: unknown): void {
  if (toolName !== "resolve_vehicle") return;
  const candidates = Array.isArray((result as { candidates?: unknown[] }).candidates)
    ? (result as { candidates: unknown[] }).candidates
    : [];
  session.lastVehicleCandidates = candidates
    .filter((candidate): candidate is { application_id?: string; description?: string; year_text?: string | null; part_count?: number } => typeof candidate === "object" && candidate !== null)
    .map((candidate) => {
      const normalized: { application_id?: string; description?: string; year_text?: string | null; part_count?: number } = {};
      if (typeof candidate.application_id === "string") normalized.application_id = candidate.application_id;
      if (typeof candidate.description === "string") normalized.description = candidate.description;
      if (typeof candidate.year_text === "string" || candidate.year_text === null) normalized.year_text = candidate.year_text;
      if (typeof candidate.part_count === "number") normalized.part_count = candidate.part_count;
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

function candidateCount(result: unknown): number {
  return Array.isArray((result as { candidates?: unknown[] }).candidates) ? (result as { candidates: unknown[] }).candidates.length : 0;
}

function manufacturerCount(result: unknown): number {
  return Array.isArray((result as { manufacturers?: unknown[] }).manufacturers) ? (result as { manufacturers: unknown[] }).manufacturers.length : 0;
}

function hasFullySpecifiedPartRequest(session: SessionState): boolean {
  return Boolean(stringSlotValue(session, "model") && stringSlotValue(session, "variant") && stringSlotValue(session, "partTerm"));
}

function uniqueTopRankedApplicationId(result: unknown): string | undefined {
  const candidates = Array.isArray((result as { candidates?: unknown[] }).candidates) ? (result as { candidates: unknown[] }).candidates : [];
  const [first, second] = candidates;
  const firstRow = parseMaybeObject(first);
  const secondRow = parseMaybeObject(second);
  const firstCount = typeof firstRow?.part_count === "number" ? firstRow.part_count : undefined;
  const secondCount = typeof secondRow?.part_count === "number" ? secondRow.part_count : undefined;
  if (typeof firstRow?.application_id !== "string" || firstCount === undefined || secondCount === undefined) return undefined;
  return firstCount > secondCount ? firstRow.application_id : undefined;
}

function vehicleCandidates(result: unknown): Array<{ description: string; year_text?: string | null }> {
  const candidates = Array.isArray((result as { candidates?: unknown[] }).candidates) ? (result as { candidates: unknown[] }).candidates : [];
  return candidates.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const row = candidate as Record<string, unknown>;
    if (typeof row.description !== "string") return [];
    return [{
      description: row.description,
      ...(typeof row.year_text === "string" || row.year_text === null ? { year_text: row.year_text } : {})
    }];
  });
}

function parseMaybeObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function fallbackProse(cardCount: number): string {
  return cardCount > 0 ? "Veja os cards encontrados: [[card:1]]" : "Nao encontrei uma peca correspondente no catalogo.";
}

function isDecline(message: string): boolean {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return ["nao sei", "nao", "pular", "ignorar"].includes(normalized);
}

function slotsFromQuestionAnswer(question: Question, message: string): StatedSlots {
  const value = message.trim();
  if (!value) return {};
  if (question.attribute === "year") {
    const year = Number.parseInt(value, 10);
    return Number.isFinite(year) ? { year } : {};
  }
  if (question.attribute === "manufacturer") return { manufacturer: value };
  if (question.attribute === "model") return { model: value };
  if (question.attribute === "partTerm") return { partTerm: value };
  return { variant: value };
}

function recordPendingQuestionSpan(session: SessionState, candidateCountAfter: number): void {
  const pending = session.pendingQuestionTelemetry;
  if (!pending) return;
  delete session.pendingQuestionTelemetry;
  const span = trace.getTracer("nexo-api").startSpan("conversation.question");
  try {
    span.setAttribute("conversation.question.attribute", pending.attribute);
    span.setAttribute("conversation.question.candidate_count_before", pending.candidateCountBefore);
    span.setAttribute("conversation.question.candidate_count_after", candidateCountAfter);
  } finally {
    span.end();
  }
}

function choiceProse(cardCount: number): string {
  const refs = Array.from({ length: cardCount }, (_, index) => `[[card:${index + 1}]]`).join(", ");
  return refs ? `Encontrei mais de uma opcao possivel. Escolha um dos cards para continuar: ${refs}.` : fallbackProse(0);
}
