import type { Pool } from "pg";
import type { CatalogReadRepository, Part, ProductGroup, VehicleApplication, Manufacturer, Asset } from "@nexo/catalog-core";

type Row = Record<string, unknown>;

export class SqlCatalogRepository implements CatalogReadRepository {
  constructor(private readonly db: Pool) {}

  async searchParts(input: { catalogId: string; query: string; applicationId?: string; groupId?: string; limit: number }): Promise<{ parts: Part[]; total: number }> {
    const result = await this.db.query(`
      SELECT p.*
      FROM part p
      WHERE p.catalog_id = $1
        AND (
          p.part_number ILIKE $2
          OR p.part_number_normalized = $3
          OR p.description ILIKE $2
        )
        AND ($4::text IS NULL OR EXISTS (
          SELECT 1 FROM part_application pa
          WHERE pa.catalog_id = p.catalog_id
            AND pa.part_id = p.part_id
            AND pa.application_id = $4
        ))
        AND ($5::text IS NULL OR p.group_id = $5 OR p.subgroup_id = $5)
      ORDER BY p.is_obsolete ASC, p.part_number
      LIMIT $6
    `, [input.catalogId, `%${input.query}%`, normalizeNumber(input.query), input.applicationId ?? null, input.groupId ?? null, input.limit]);
    const parts = result.rows.map(mapPart);
    return { parts, total: parts.length };
  }

  async getPart(input: { catalogId: string; partId?: string; partNumber?: string }): Promise<Part | null> {
    const result = await this.db.query(`
      SELECT *
      FROM part
      WHERE catalog_id = $1
        AND ($2::text IS NULL OR part_id = $2)
        AND ($3::text IS NULL OR part_number = $3 OR part_number_normalized = $4)
      LIMIT 1
    `, [input.catalogId, input.partId ?? null, input.partNumber ?? null, input.partNumber ? normalizeNumber(input.partNumber) : null]);
    return result.rows[0] ? mapPart(result.rows[0]) : null;
  }

  async listGroups(input: { catalogId: string; parentGroupId?: string | null; applicationId?: string }): Promise<Array<ProductGroup & { partCount: number }>> {
    const result = await this.db.query(`
      SELECT g.*, COUNT(p.part_id)::int AS part_count
      FROM product_group g
      LEFT JOIN part p ON p.catalog_id = g.catalog_id AND (p.group_id = g.group_id OR p.subgroup_id = g.group_id)
      WHERE g.catalog_id = $1
        AND (($2::text IS NULL AND g.parent_group_id IS NULL) OR g.parent_group_id = $2)
      GROUP BY g.catalog_id, g.group_id, g.parent_group_id, g.description
      ORDER BY g.description
    `, [input.catalogId, input.parentGroupId ?? null]);
    return result.rows.map((row: Row) => ({
      catalogId: String(row.catalog_id),
      groupId: String(row.group_id),
      parentGroupId: row.parent_group_id == null ? null : String(row.parent_group_id),
      description: String(row.description),
      partCount: Number(row.part_count)
    }));
  }

  async resolveVehicle(input: { catalogId: string; model: string; manufacturerId?: string; manufacturer?: string; year?: number; limit: number }): Promise<{ candidates: VehicleApplication[]; widened: boolean }> {
    const exact = await this.findVehicleCandidates(input, true);
    if (input.year && exact.length === 0) {
      return { candidates: await this.findVehicleCandidates(input, false), widened: true };
    }
    return { candidates: exact, widened: false };
  }

  async listManufacturers(input: { catalogId: string; scope: "vehicle" | "cross_reference"; search?: string; limit: number }): Promise<Array<Manufacturer & { applicationCount: number }>> {
    const flag = input.scope === "vehicle" ? "used_for_vehicles" : "used_for_cross_reference";
    const result = await this.db.query(`
      SELECT *
      FROM manufacturer
      WHERE catalog_id = $1
        AND ${flag} = TRUE
        AND ($2::text IS NULL OR name ILIKE $3)
      ORDER BY application_count DESC, name
      LIMIT $4
    `, [input.catalogId, input.search ?? null, `${input.search ?? ""}%`, input.limit]);
    return result.rows.map((row: Row) => ({
      catalogId: String(row.catalog_id),
      manufacturerId: String(row.manufacturer_id),
      name: String(row.name),
      usedForVehicles: Boolean(row.used_for_vehicles),
      usedForCrossReference: Boolean(row.used_for_cross_reference),
      applicationCount: Number(row.application_count)
    }));
  }

  async listVehicleModels(input: { catalogId: string; manufacturerId: string; search?: string; limit: number }): Promise<{ models: Array<{ description: string; applicationCount: number; yearSpanText: string | null }>; truncated: boolean }> {
    const result = await this.db.query(`
      SELECT description, COUNT(*)::int AS application_count, MIN(year_text) AS year_span_text
      FROM vehicle_application
      WHERE catalog_id = $1
        AND manufacturer_id = $2
        AND ($3::text IS NULL OR description ILIKE $4)
      GROUP BY description
      ORDER BY application_count DESC, description
      LIMIT $5
    `, [input.catalogId, input.manufacturerId, input.search ?? null, `%${input.search ?? ""}%`, input.limit + 1]);
    return {
      models: result.rows.slice(0, input.limit).map((row: Row) => ({
        description: String(row.description),
        applicationCount: Number(row.application_count),
        yearSpanText: row.year_span_text == null ? null : String(row.year_span_text)
      })),
      truncated: result.rows.length > input.limit
    };
  }

  async getAssemblies(input: { catalogId: string; partId: string }): Promise<{
    parentAssemblies: Array<Part & { quantity?: number; drawingItem?: string | null }>;
    components: Array<Part & { quantity?: number; drawingItem?: string | null }>;
    sameDrawing: Part[];
  }> {
    const parentAssemblies = await this.db.query(`
      SELECT p.*, ac.quantity, ac.drawing_item
      FROM assembly_component ac
      JOIN part p ON p.catalog_id = ac.catalog_id AND p.part_id = ac.assembly_part_id
      WHERE ac.catalog_id = $1 AND ac.component_part_id = $2
      ORDER BY p.is_obsolete ASC, p.part_number
    `, [input.catalogId, input.partId]);
    const components = await this.db.query(`
      SELECT p.*, ac.quantity, ac.drawing_item
      FROM assembly_component ac
      JOIN part p ON p.catalog_id = ac.catalog_id AND p.part_id = ac.component_part_id
      WHERE ac.catalog_id = $1 AND ac.assembly_part_id = $2
      ORDER BY p.is_obsolete ASC, p.part_number
    `, [input.catalogId, input.partId]);
    const sameDrawing = await this.db.query(`
      SELECT other.*
      FROM part current
      JOIN part other ON other.catalog_id = current.catalog_id
                     AND other.drawing_id = current.drawing_id
                     AND other.part_id <> current.part_id
      WHERE current.catalog_id = $1
        AND current.part_id = $2
        AND current.drawing_id IS NOT NULL
      ORDER BY other.is_obsolete ASC, other.part_number
    `, [input.catalogId, input.partId]);
    return {
      parentAssemblies: parentAssemblies.rows.map((row: Row) => withAssemblyFields(mapPart(row), row)),
      components: components.rows.map((row: Row) => withAssemblyFields(mapPart(row), row)),
      sameDrawing: sameDrawing.rows.map(mapPart)
    };
  }

  async findCrossReference(input: { catalogId: string; foreignNumber: string }): Promise<Array<Part & { foreignManufacturerName: string; foreignNumber: string }>> {
    const result = await this.db.query(`
      SELECT p.*, m.name AS foreign_manufacturer_name, cr.foreign_number
      FROM cross_reference cr
      JOIN part p ON p.catalog_id = cr.catalog_id AND p.part_id = cr.part_id
      JOIN manufacturer m ON m.catalog_id = cr.catalog_id AND m.manufacturer_id = cr.foreign_manufacturer_id
      WHERE cr.catalog_id = $1
        AND cr.foreign_number_normalized = $2
      ORDER BY p.is_obsolete ASC, p.part_number
    `, [input.catalogId, normalizeNumber(input.foreignNumber)]);
    return result.rows.map((row: Row) => ({
      ...mapPart(row),
      foreignManufacturerName: String(row.foreign_manufacturer_name),
      foreignNumber: String(row.foreign_number)
    }));
  }

  async getAsset(input: { catalogId: string; assetId: string }): Promise<Asset | null> {
    const result = await this.db.query("SELECT * FROM asset WHERE catalog_id = $1 AND asset_id = $2", [input.catalogId, input.assetId]);
    const row = result.rows[0] as Row | undefined;
    return row ? {
      catalogId: String(row.catalog_id),
      assetId: String(row.asset_id),
      kind: row.kind === "drawing" ? "drawing" : "photo",
      path: String(row.path),
      contentType: String(row.content_type)
    } : null;
  }

  private async findVehicleCandidates(input: { catalogId: string; model: string; manufacturerId?: string; manufacturer?: string; year?: number; limit: number }, applyYear: boolean): Promise<VehicleApplication[]> {
    const result = await this.db.query(`
      SELECT va.*
      FROM vehicle_application va
      LEFT JOIN manufacturer m ON m.catalog_id = va.catalog_id AND m.manufacturer_id = va.manufacturer_id
      WHERE va.catalog_id = $1
        AND va.description ILIKE $2
        AND ($3::text IS NULL OR va.manufacturer_id = $3)
        AND ($4::text IS NULL OR m.name ILIKE $5)
        AND (
          $6::boolean = FALSE OR $7::int IS NULL OR
          ((va.year_from IS NULL OR $7 >= va.year_from) AND (va.year_to IS NULL OR $7 <= va.year_to))
        )
      ORDER BY va.description
      LIMIT $8
    `, [
      input.catalogId,
      `%${input.model}%`,
      input.manufacturerId ?? null,
      input.manufacturer ?? null,
      `%${input.manufacturer ?? ""}%`,
      applyYear,
      input.year ?? null,
      input.limit
    ]);
    return result.rows.map(mapVehicleApplication);
  }
}

function mapPart(row: Row): Part {
  return {
    catalogId: String(row.catalog_id),
    partId: String(row.part_id),
    partNumber: String(row.part_number),
    partNumberNormalized: String(row.part_number_normalized),
    description: String(row.description),
    groupId: row.group_id == null ? null : String(row.group_id),
    subgroupId: row.subgroup_id == null ? null : String(row.subgroup_id),
    photoId: row.photo_id == null ? null : String(row.photo_id),
    note: row.note == null ? null : String(row.note),
    drawingId: row.drawing_id == null ? null : String(row.drawing_id),
    isAssembly: Boolean(row.is_assembly),
    isObsolete: Boolean(row.is_obsolete)
  };
}

function mapVehicleApplication(row: Row): VehicleApplication {
  return {
    catalogId: String(row.catalog_id),
    applicationId: String(row.application_id),
    manufacturerId: row.manufacturer_id == null ? null : String(row.manufacturer_id),
    description: String(row.description),
    yearFrom: row.year_from == null ? null : Number(row.year_from),
    yearTo: row.year_to == null ? null : Number(row.year_to),
    yearText: row.year_text == null ? null : String(row.year_text)
  };
}

function withAssemblyFields(part: Part, row: Row): Part & { quantity?: number; drawingItem?: string | null } {
  return {
    ...part,
    ...(row.quantity == null ? {} : { quantity: Number(row.quantity) }),
    drawingItem: row.drawing_item == null ? null : String(row.drawing_item)
  };
}

function normalizeNumber(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
