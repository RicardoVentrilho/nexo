import type { PoolClient } from "pg";

export interface ReconcileWarning {
  code: string;
  count: number;
}

export async function assertCanonicalIntegrity(db: PoolClient): Promise<ReconcileWarning[]> {
  const failedPartApplications = await db.query(`
    SELECT COUNT(*) AS count
    FROM part_application pa
    LEFT JOIN part p ON p.catalog_id = pa.catalog_id AND p.part_id = pa.part_id
    LEFT JOIN vehicle_application va ON va.catalog_id = pa.catalog_id AND va.application_id = pa.application_id
    WHERE p.part_id IS NULL OR va.application_id IS NULL
  `);

  const failedPartApplicationCount = Number(failedPartApplications.rows[0]?.count ?? 0);
  if (failedPartApplicationCount > 0) {
    throw new Error(`part_application contains ${failedPartApplicationCount} broken joins`);
  }

  const missingAssets = await db.query(`
    SELECT COUNT(*) AS count
    FROM part
    WHERE photo_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM asset
        WHERE asset.catalog_id = part.catalog_id
          AND asset.asset_id = part.photo_id
      )
  `);
  const missingAssetCount = Number(missingAssets.rows[0]?.count ?? 0);

  return missingAssetCount > 0 ? [{ code: "missing_optional_assets", count: missingAssetCount }] : [];
}
