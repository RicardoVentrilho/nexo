import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { SqlCatalogRepository } from "../../apps/mcp/src/catalog/sqlCatalogRepository.js";

const catalogDatabaseUrl = process.env.CATALOG_DATABASE_URL;

describe("vehicle golden queries", () => {
  it.skipIf(!catalogDatabaseUrl)("returns multiple candidates for ambiguous Cargo 1723", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    const result = await repository.resolveVehicle({
      catalogId: "eaton",
      model: "Cargo 1723",
      limit: 10
    });
    await pool.end();

    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it.skipIf(!catalogDatabaseUrl)("widens when a requested year empties exact matches", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    const result = await repository.resolveVehicle({
      catalogId: "eaton",
      model: "Cargo 1723 Torqshift",
      year: 2010,
      limit: 10
    });
    await pool.end();

    expect(result.widened).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it.skipIf(!catalogDatabaseUrl)("offers the applications that actually carry parts, not the alphabetically first", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    // 48 applications match "Cargo 2422"; 16049 is the one with 18 parts linked.
    const result = await repository.resolveVehicle({
      catalogId: "eaton",
      model: "Cargo 2422",
      limit: 5
    });
    await pool.end();

    expect(result.candidates[0]).toMatchObject({
      applicationId: "16049",
      partCount: 18
    });
  });
});
