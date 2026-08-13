import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyCanonicalDatabase } from "../../packages/catalog-import/src/canonical/writer.js";

const catalogDatabaseUrl = process.env.CATALOG_DATABASE_URL;
const scratchDatabases: string[] = [];

describe("catalog import pipeline", () => {
  afterEach(async () => {
    if (!catalogDatabaseUrl) return;
    const adminPool = new Pool({ connectionString: adminDatabaseUrl(catalogDatabaseUrl) });
    try {
      for (const databaseName of scratchDatabases.splice(0)) {
        await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
      }
    } finally {
      await adminPool.end();
    }
  });

  it.skipIf(!catalogDatabaseUrl)("creates pg_trgm and unaccent on a database built from scratch", async () => {
    const databaseName = `nexo_import_test_${process.pid}_${Date.now()}`;
    scratchDatabases.push(databaseName);

    const adminPool = new Pool({ connectionString: adminDatabaseUrl(catalogDatabaseUrl) });
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    await adminPool.end();

    const { pool, client } = await createEmptyCanonicalDatabase(databaseUrl(catalogDatabaseUrl, databaseName));
    try {
      const result = await client.query<{ extname: string }>(`
        SELECT extname
        FROM pg_extension
        WHERE extname IN ('pg_trgm', 'unaccent')
        ORDER BY extname
      `);

      expect(result.rows.map((row) => row.extname)).toEqual(["pg_trgm", "unaccent"]);
    } finally {
      client.release();
      await pool.end();
    }
  });
});

function adminDatabaseUrl(connectionString: string): string {
  return databaseUrl(connectionString, "postgres");
}

function databaseUrl(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}
