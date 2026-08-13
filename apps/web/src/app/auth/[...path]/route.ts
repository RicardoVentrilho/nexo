function targetUrl(request: Request, path: string[]): URL {
  const internalOrigin = process.env.KEYCLOAK_INTERNAL_ORIGIN ?? "http://keycloak:8080";
  const url = new URL(request.url);
  const target = new URL(`${internalOrigin}/${path.join("/")}`);
  target.search = url.search;
  return target;
}

async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    redirect: "manual"
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  const response = await fetch(targetUrl(request, path), init);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers
  });
}

export const GET = proxy;
export const POST = proxy;
