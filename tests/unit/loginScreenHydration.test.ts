import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoginScreen } from "../../apps/web/src/slices/identity/LoginScreen.js";

describe("LoginScreen SSR", () => {
  it("does not render credential inputs on the server before hydration", () => {
    const html = renderToString(createElement(LoginScreen));

    expect(html).toContain("Entrar no Nexo");
    expect(html).not.toContain('id="identifier"');
    expect(html).not.toContain('id="password"');
  });
});
