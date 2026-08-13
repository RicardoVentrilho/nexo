import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { SqlCatalogRepository } from "../../apps/mcp/src/catalog/sqlCatalogRepository.js";

const catalogDatabaseUrl = process.env.CATALOG_DATABASE_URL;

describe("part golden queries", () => {
  it.skipIf(!catalogDatabaseUrl)("finds the known clutch part for Cargo 1723", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    const result = await repository.searchParts({
      catalogId: "eaton",
      query: "EMBREAGEM",
      applicationId: "24951",
      limit: 5
    });
    await pool.end();

    expect(result.parts.map((part) => part.partNumber)).toContain("177037");
  });

  it.skipIf(!catalogDatabaseUrl)("matches every query term separately instead of the whole phrase", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    // "Kit 365mm (P/ Tubo Guia)" — the terms are in the description but never adjacent.
    const result = await repository.searchParts({
      catalogId: "eaton",
      query: "kit tubo guia",
      applicationId: "16049",
      limit: 5
    });
    await pool.end();

    expect(result.parts.map((part) => part.partNumber)).toContain("104109-8");
  });

  it.skipIf(!catalogDatabaseUrl)("finds application parts when the term matches only the product group", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    const result = await repository.searchParts({
      catalogId: "eaton",
      query: "embreagem",
      applicationId: "16049",
      limit: 25
    });
    await pool.end();

    expect(result.parts).toHaveLength(18);
    expect(result.parts.map((part) => part.partNumber)).toContain("104109-8");
  });

  it.skipIf(!catalogDatabaseUrl)("matches part terms accent-insensitively", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    const withoutAccent = await repository.searchParts({
      catalogId: "eaton",
      query: "valvula",
      limit: 10
    });
    const withAccent = await repository.searchParts({
      catalogId: "eaton",
      query: "válvula",
      limit: 10
    });
    await pool.end();

    expect(withAccent.parts.map((part) => part.partNumber)).toEqual(withoutAccent.parts.map((part) => part.partNumber));
    expect(withAccent.parts.length).toBeGreaterThan(0);
  });
});
