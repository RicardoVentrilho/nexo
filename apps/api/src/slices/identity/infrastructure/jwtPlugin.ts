import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Principal } from "../application/authoriseRequest.js";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export async function jwtPlugin(app: FastifyInstance): Promise<void> {
  const jwksUri = process.env.KEYCLOAK_JWKS_URI;
  if (!jwksUri) throw new Error("KEYCLOAK_JWKS_URI is required");
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  const realm = process.env.KEYCLOAK_REALM ?? "nexo";
  const issuer = process.env.KEYCLOAK_PUBLIC_ORIGIN
    ? `${process.env.KEYCLOAK_PUBLIC_ORIGIN.replace(/\/$/, "")}/auth/realms/${realm}`
    : undefined;

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === "/health" || request.url === "/ready") return;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      await reply.code(401).send({ error: { code: "unauthenticated", message: "Bearer token required" } });
      return;
    }

    const verifyResult = await jwtVerify(
      authorization.slice("Bearer ".length),
      jwks,
      issuer ? { issuer } : {}
    ).catch(() => undefined);
    if (!verifyResult) {
      await reply.code(401).send({ error: { code: "unauthenticated", message: "Invalid bearer token" } });
      return;
    }

    const { payload } = verifyResult;
    const realmAccess = payload.realm_access as { roles?: unknown[] } | undefined;
    const roles = Array.isArray(realmAccess?.roles) ? realmAccess.roles : [];
    request.principal = {
      subject: String(payload.sub),
      displayName: String(payload.name ?? payload.preferred_username ?? payload.sub),
      roles: roles.filter((role): role is "user" | "administrator" => role === "user" || role === "administrator")
    };
  });
}
