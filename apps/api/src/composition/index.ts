import Fastify from "fastify";
import { jwtPlugin } from "../slices/identity/infrastructure/jwtPlugin.js";
import { conversationRoutes } from "../slices/conversation/infrastructure/routes.js";
import { assetRoutes } from "../slices/assets/routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  await jwtPlugin(app);
  await conversationRoutes(app);
  await assetRoutes(app);
  app.get("/health", async () => ({ ok: true }));
  app.get("/ready", async () => ({
    ok: Boolean(process.env.CATALOG_DATABASE_URL) && Boolean(process.env.OPENAI_API_KEY) && Boolean(process.env.OPENAI_MODEL)
  }));
  app.get("/v1/session", async (request, reply) => {
    if (!request.principal) return reply.code(401).send({ error: { code: "unauthenticated", message: "Authentication required" } });
    return request.principal;
  });
  return app;
}
