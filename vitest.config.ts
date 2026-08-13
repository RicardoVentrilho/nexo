import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      { test: { name: "contract", include: ["tests/contract/**/*.test.ts"] } },
      { test: { name: "golden", include: ["tests/golden/**/*.test.ts"] } },
      { test: { name: "e2e", include: ["tests/e2e/**/*.spec.ts"] } }
    ]
  }
});
