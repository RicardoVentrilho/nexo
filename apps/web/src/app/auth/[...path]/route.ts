import { buildKeycloakTargetUrls } from "../../../slices/identity/keycloakProxy";

function targetUrls(request: Request, path: string[]): URL[] {
  const internalOrigin = process.env.KEYCLOAK_INTERNAL_ORIGIN ?? "http://keycloak:8080";
  return buildKeycloakTargetUrls({
    internalOrigin,
    localOrigin: process.env.KEYCLOAK_LOCAL_ORIGIN ?? "http://localhost:8081",
    path,
    requestUrl: request.url
  });
}

async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const body = request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined;
  let lastError: unknown;
  for (const url of targetUrls(request, path)) {
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      redirect: "manual"
    };
    if (body) init.body = body.slice(0);
    try {
      const response = await fetch(url, init);
      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export const GET = proxy;
export const POST = proxy;
