export interface AuthorizationUrlInput {
  challenge: string;
  clientId: string;
  publicOrigin: string;
  realm: string;
  redirectUri: string;
}

export function buildAuthorizationUrl({ challenge, clientId, publicOrigin, realm, redirectUri }: AuthorizationUrlInput): URL {
  const url = new URL(`${publicOrigin}/auth/realms/${realm}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export function resolveKeycloakClientSecret({
  clientSecret,
  nodeEnv
}: {
  clientSecret?: string | undefined;
  nodeEnv?: string | undefined;
}): string {
  if (clientSecret !== undefined) return clientSecret;
  return nodeEnv === "production" ? "" : "local-dev-secret";
}
