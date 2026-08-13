import { createReadStream, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import type { FastifyInstance } from "fastify";

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/assets/:catalogId/:assetId", async (request, reply) => {
    if (!request.principal) return reply.code(401).send({ error: { code: "unauthenticated", message: "Authentication required" } });
    const params = request.params as { catalogId: string; assetId: string };
    const root = process.env.CATALOG_ASSET_ROOT ?? ".data/assets";
    const path = normalize(join(root, params.catalogId, params.assetId));
    if (!path.startsWith(normalize(root))) return reply.code(404).send();
    if (!existsSync(path)) return reply.code(404).send();
    return reply.type("application/octet-stream").send(createReadStream(path));
  });
}
