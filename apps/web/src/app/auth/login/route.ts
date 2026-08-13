import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createPkcePair } from "../../../slices/identity/pkce";

export async function GET() {
  const { verifier, challenge } = createPkcePair();
  const cookieStore = await cookies();
  cookieStore.set("nexo_pkce_verifier", verifier, { httpOnly: true, sameSite: "lax", path: "/auth" });

  const publicOrigin = process.env.KEYCLOAK_PUBLIC_ORIGIN ?? "http://localhost:3000";
  const realm = process.env.KEYCLOAK_REALM ?? "nexo";
  const clientId = process.env.KEYCLOAK_CLIENT_ID ?? "nexo-web";
  const redirectUri = `${publicOrigin}/auth/callback`;
  const url = new URL(`${publicOrigin}/auth/realms/${realm}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(url);
}
