import js from "@eslint/js";
import tseslint from "typescript-eslint";

const noRestrictedImports = [
  "error",
  {
    paths: [
      {
        name: "better-sqlite3",
        message: "SQLite is allowed only in catalog-import for reading the legacy Eaton source. Runtime catalog access uses Postgres."
      },
      {
        name: "@nexo/catalog-import",
        message: "Runtime code must not import the catalog import pipeline"
      }
    ],
    patterns: ["packages/catalog-import/*", "@nexo/catalog-import/*"]
  }
];

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.next/**", ".data/**", "*.sqlite"]
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly"
      }
    },
    rules: {
      "no-restricted-imports": noRestrictedImports
    }
  },
  {
    files: ["packages/catalog-import/src/**/*.ts"],
    rules: {
      "no-restricted-imports": "off"
    }
  },
  {
    files: ["apps/web/next-env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off"
    }
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "no-restricted-imports": "off"
    }
  }
);
