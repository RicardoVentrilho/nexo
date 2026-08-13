import type { FastifyInstance } from "fastify";
import { TurnRequest } from "@nexo/contracts/api";
import { authoriseRequest } from "../../identity/application/authoriseRequest.js";
import { RunTurn } from "../application/runTurn.js";
import { InternalMcpClient } from "./mcpClient.js";
import { SessionStore } from "./sessionStore.js";

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  const sessions = new SessionStore();
  const runTurn = new RunTurn(new InternalMcpClient());

  app.post("/v1/conversations/:sessionId/turns", async (request, reply) => {
    if (!request.principal) return reply.code(401).send({ error: { code: "unauthenticated", message: "Authentication required" } });
    authoriseRequest(request.principal);
    const params = request.params as { sessionId: string };
    const body = TurnRequest.parse(request.body);
    const session = sessions.getOrCreate(params.sessionId, request.principal);
    if (session.inFlight) return reply.code(429).send({ error: { code: "turn_in_flight", message: "Turn already in flight" } });
    session.inFlight = true;
    try {
      return await runTurn.execute(session, body.message);
    } catch (error) {
      request.log.error({ err: error }, "conversation turn failed");
      return reply.code(503).send({
        error: {
          code: "catalog_unavailable",
          message: turnFailureMessage(error)
        }
      });
    } finally {
      session.inFlight = false;
    }
  });
}

function turnFailureMessage(error: unknown): string {
  if (isOpenAiCreditError(error)) {
    return "A API da OpenAI recusou a chamada por falta de creditos na conta configurada.";
  }
  if (error instanceof Error && error.message.startsWith("MCP tool ")) {
    return "O catalogo nao conseguiu executar a ferramenta MCP solicitada.";
  }
  return "Nao foi possivel processar a mensagem.";
}

function isOpenAiCreditError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "credit_balance_exhausted";
}
