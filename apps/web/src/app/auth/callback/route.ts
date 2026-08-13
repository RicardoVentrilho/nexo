import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { setSessionCookie } from "../../../slices/identity/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const verifier = (await cookies()).get("nexo_pkce_verifier")?.value;
  if (!code || !verifier) return NextResponse.json({ error: "missing authorization response" }, { status: 400 });

  const publicOrigin = process.env.KEYCLOAK_PUBLIC_ORIGIN ?? "http://localhost:3000";
  const internalOrigin = process.env.KEYCLOAK_INTERNAL_ORIGIN ?? "http://keycloak:8080";
  const realm = process.env.KEYCLOAK_REALM ?? "nexo";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.KEYCLOAK_CLIENT_ID ?? "nexo-web",
    client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
    redirect_uri: `${publicOrigin}/auth/callback`,
    code,
    code_verifier: verifier
  });

  const response = await fetch(`${internalOrigin}/realms/${realm}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) return NextResponse.json({ error: "token exchange failed" }, { status: 502 });
  const token = (await response.json()) as { access_token: string };
  await setSessionCookie(token.access_token);
  return NextResponse.redirect(new URL("/", request.url));
}
