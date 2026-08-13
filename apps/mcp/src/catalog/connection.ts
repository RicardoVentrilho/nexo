import { Pool } from "pg";

export function openCatalogDatabase(): Pool {
  const connectionString = process.env.CATALOG_DATABASE_URL;
  if (!connectionString) {
    throw new Error("CATALOG_DATABASE_URL is required");
  }
  return new Pool({ connectionString });
}
