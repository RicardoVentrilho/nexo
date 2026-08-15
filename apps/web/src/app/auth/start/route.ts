import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "../../../slices/identity/authStart";
import { createPkcePair } from "../../../slices/identity/pkce";

export async function GET() {
  const { verifier, challenge } = createPkcePair();
  const cookieStore = await cookies();
  cookieStore.set("nexo_pkce_verifier", verifier, { httpOnly: true, sameSite: "lax", path: "/auth" });

  const publicOrigin = process.env.KEYCLOAK_PUBLIC_ORIGIN ?? "http://localhost:3000";
  const realm = process.env.KEYCLOAK_REALM ?? "nexo";
  const clientId = process.env.KEYCLOAK_CLIENT_ID ?? "nexo-web";
  const redirectUri = `${publicOrigin}/auth/callback`;
  return NextResponse.redirect(buildAuthorizationUrl({ challenge, clientId, publicOrigin, realm, redirectUri }));
}
