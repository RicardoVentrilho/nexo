import { describe, expect, it } from "vitest";
import { buildKeycloakTargetUrls } from "../../apps/web/src/slices/identity/keycloakProxy.js";

describe("buildKeycloakTargetUrls", () => {
  it("tries the Docker Keycloak origin before the host-local fallback", () => {
    const targets = buildKeycloakTargetUrls({
      internalOrigin: "http://keycloak:8080",
      localOrigin: "http://localhost:8081",
      path: ["realms", "nexo", "protocol", "openid-connect", "auth"],
      requestUrl: "http://localhost:3000/auth/realms/nexo/protocol/openid-connect/auth?client_id=nexo-web"
    });

    expect(targets.map((target) => target.toString())).toEqual([
      "http://keycloak:8080/realms/nexo/protocol/openid-connect/auth?client_id=nexo-web",
      "http://localhost:8081/realms/nexo/protocol/openid-connect/auth?client_id=nexo-web"
    ]);
  });
});
