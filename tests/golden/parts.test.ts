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
});
