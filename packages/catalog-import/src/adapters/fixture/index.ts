import { createEmptyCanonicalDatabase, finalizeCanonicalDatabase } from "../../canonical/writer.js";

export async function importFixtureCatalog(_sourceDir: string, connectionString: string): Promise<{ catalogId: string; counts: Record<string, number> }> {
  const { pool, client } = await createEmptyCanonicalDatabase(connectionString);
  const catalogId = "fixture";
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO catalog (catalog_id, name, source_format, imported_at, source_checksum)
      VALUES ($1, $2, $3, $4, $5)
    `, [catalogId, "Fixture Catalog", "fixture", new Date().toISOString(), "fixture"]);
    await client.query(`
      INSERT INTO manufacturer (catalog_id, manufacturer_id, name, used_for_vehicles, used_for_cross_reference, application_count)
      VALUES ($1, $2, $3, TRUE, TRUE, 1)
    `, [catalogId, "fixture-maker", "Fixture Maker"]);
    await client.query(`
      INSERT INTO product_group (catalog_id, group_id, parent_group_id, description)
      VALUES ($1, $2, NULL, $3)
    `, [catalogId, "g:fixture", "Fixture Group"]);
    await client.query(`
      INSERT INTO part (catalog_id, part_id, part_number, part_number_normalized, description, is_obsolete, group_id, subgroup_id, photo_id, note, drawing_id, is_assembly)
      VALUES ($1, $2, $3, $4, $5, FALSE, $6, NULL, NULL, NULL, NULL, FALSE)
    `, [catalogId, "fixture-part", "FX-100", "FX100", "Fixture clutch", "g:fixture"]);
    await client.query(`
      INSERT INTO vehicle_application (catalog_id, application_id, manufacturer_id, description, year_from, year_to, year_text)
      VALUES ($1, $2, $3, $4, 2020, NULL, $5)
    `, [catalogId, "fixture-app", "fixture-maker", "Fixture Truck", "2020/..."]);
    await client.query(`
      INSERT INTO part_application (catalog_id, part_id, application_id)
      VALUES ($1, $2, $3)
    `, [catalogId, "fixture-part", "fixture-app"]);
    await finalizeCanonicalDatabase(client);
    await client.query("COMMIT");
    return { catalogId, counts: { catalog: 1, part: 1, vehicle_application: 1, part_application: 1 } };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
