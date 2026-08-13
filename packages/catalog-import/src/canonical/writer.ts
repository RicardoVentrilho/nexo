import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { rebuildFtsIndexes } from "./fts.js";
import { assertCanonicalIntegrity, type ReconcileWarning } from "./reconcile.js";

export interface CanonicalBuildResult {
  db: PoolClient;
  warnings: ReconcileWarning[];
}

export async function createEmptyCanonicalDatabase(connectionString: string): Promise<{ pool: Pool; client: PoolClient }> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  await client.query(readFileSync(schemaPath, "utf8"));
  return { pool, client };
}

export async function finalizeCanonicalDatabase(db: PoolClient): Promise<ReconcileWarning[]> {
  await rebuildFtsIndexes(db);
  return assertCanonicalIntegrity(db);
}
