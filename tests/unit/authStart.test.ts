import { describe, expect, it } from "vitest";
import { buildAuthorizationUrl, resolveKeycloakClientSecret } from "../../apps/web/src/slices/identity/authStart.js";

describe("buildAuthorizationUrl", () => {
  it("builds the Keycloak authorization URL with PKCE parameters", () => {
    const url = buildAuthorizationUrl({
      challenge: "pkce-challenge",
      clientId: "nexo-web",
      publicOrigin: "https://nexo.example.com",
      realm: "nexo",
      redirectUri: "https://nexo.example.com/auth/callback"
    });

    expect(url.origin).toBe("https://nexo.example.com");
    expect(url.pathname).toBe("/auth/realms/nexo/protocol/openid-connect/auth");
    expect(url.searchParams.get("client_id")).toBe("nexo-web");
    expect(url.searchParams.get("redirect_uri")).toBe("https://nexo.example.com/auth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid profile");
    expect(url.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("uses the local development client secret when no env secret is loaded outside production", () => {
    expect(resolveKeycloakClientSecret({ nodeEnv: "development" })).toBe("local-dev-secret");
    expect(resolveKeycloakClientSecret({ clientSecret: "configured-secret", nodeEnv: "development" })).toBe("configured-secret");
    expect(resolveKeycloakClientSecret({ nodeEnv: "production" })).toBe("");
  });
});
