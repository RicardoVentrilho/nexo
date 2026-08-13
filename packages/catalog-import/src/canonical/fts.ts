import type { PoolClient } from "pg";

export async function rebuildFtsIndexes(db: PoolClient): Promise<void> {
  await db.query(`
    CREATE INDEX idx_part_search_vector ON part
    USING gin (to_tsvector('simple', part_number || ' ' || part_number_normalized || ' ' || description));

    CREATE INDEX idx_application_search_vector ON vehicle_application
    USING gin (to_tsvector('simple', description));
  `);
}
