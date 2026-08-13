import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { SqlCatalogRepository } from "../../apps/mcp/src/catalog/sqlCatalogRepository.js";

const catalogDatabaseUrl = process.env.CATALOG_DATABASE_URL;

describe("cross-reference golden query", () => {
  it.skipIf(!catalogDatabaseUrl)("normalises punctuated and unpunctuated forms consistently", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const row = (await pool.query(`
      SELECT foreign_number, foreign_number_normalized
      FROM cross_reference
      WHERE foreign_number != foreign_number_normalized
      LIMIT 1
    `)).rows[0] as { foreign_number: string; foreign_number_normalized: string } | undefined;
    const repository = new SqlCatalogRepository(pool);
    const punctuated = row ? await repository.findCrossReference({ catalogId: "eaton", foreignNumber: row.foreign_number }) : [];
    const normalized = row ? await repository.findCrossReference({ catalogId: "eaton", foreignNumber: row.foreign_number_normalized }) : [];
    await pool.end();

    expect(row).toBeDefined();
    expect(row?.foreign_number.replace(/[^0-9A-Za-z]/g, "").toUpperCase()).toBe(row?.foreign_number_normalized);
    expect(punctuated.length).toBeGreaterThan(0);
    expect(punctuated.map((part) => part.partId)).toEqual(normalized.map((part) => part.partId));
  });
});
