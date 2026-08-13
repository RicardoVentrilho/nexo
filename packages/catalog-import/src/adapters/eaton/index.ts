import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { PoolClient } from "pg";
import { createEmptyCanonicalDatabase, finalizeCanonicalDatabase } from "../../canonical/writer.js";
import { buildAssetIndex } from "./assetIndex.js";
import { normalizeNumber } from "./normalizeNumber.js";
import { isObsoleteSearchBlob } from "./obsolete.js";
import { parseYearRange } from "./parseYearRange.js";
import { rtfToPlainText } from "./rtf.js";

export interface ImportResult {
  catalogId: string;
  counts: Record<string, number>;
  warnings: Array<{ code: string; count: number }>;
}

export async function importEatonCatalog(sourceDir: string, connectionString: string): Promise<ImportResult> {
  const sourceDbPath = join(sourceDir, "eaton_catalogo.sqlite");
  const source = new Database(sourceDbPath, { readonly: true });
  const { pool, client: target } = await createEmptyCanonicalDatabase(connectionString);
  const catalogId = "eaton";
  const sourceChecksum = createHash("sha256").update(readFileSync(sourceDbPath)).digest("hex");
  const assets = safeBuildAssetIndex(sourceDir);

  try {
    await target.query("BEGIN");
    await target.query(`
      INSERT INTO catalog (catalog_id, name, source_format, imported_at, source_checksum)
      VALUES ($1, $2, $3, $4, $5)
    `, [catalogId, "Catalogo Eaton - Pecas Pesadas", "eaton-catalogoexpresso-375", new Date().toISOString(), sourceChecksum]);

    const counts: Record<string, number> = { catalog: 1 };
    counts.manufacturer = await importManufacturers(source, target, catalogId);
    counts.product_group = await importProductGroups(source, target, catalogId);
    counts.part = await importParts(source, target, catalogId, assets);
    counts.vehicle_application = await importVehicleApplications(source, target, catalogId);
    counts.part_application = await importPartApplications(source, target, catalogId);
    counts.drawing = await importDrawings(source, target, catalogId, assets);
    counts.drawing_item = await importDrawingItems(source, target, catalogId);
    counts.assembly_component = await importAssemblyComponents(source, target, catalogId);
    counts.cross_reference = await importCrossReferences(source, target, catalogId);
    await updateManufacturerApplicationCounts(target, catalogId);
    const warnings = await finalizeCanonicalDatabase(target);
    await target.query("COMMIT");
    return { catalogId, counts, warnings };
  } catch (error) {
    await target.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    source.close();
    target.release();
    await pool.end();
  }
}

async function importProductGroups(source: Database.Database, target: PoolClient, catalogId: string): Promise<number> {
  const groups = source.prepare("SELECT CodigoGrupoProduto, DescricaoGrupoProduto FROM GRUPOPRODUTO").all() as Array<Record<string, unknown>>;
  const subgroups = source.prepare("SELECT CodigoSubGrupoProduto, CodigoGrupoProduto, DescricaoSubGrupoProduto FROM SUBGRUPOPRODUTO").all() as Array<Record<string, unknown>>;
  for (const row of groups) {
    await target.query(
      "INSERT INTO product_group (catalog_id, group_id, parent_group_id, description) VALUES ($1, $2, $3, $4)",
      [catalogId, groupId(row.CodigoGrupoProduto), null, String(row.DescricaoGrupoProduto ?? "")]
    );
  }
  for (const row of subgroups) {
    await target.query(
      "INSERT INTO product_group (catalog_id, group_id, parent_group_id, description) VALUES ($1, $2, $3, $4)",
      [catalogId, subgroupId(row.CodigoSubGrupoProduto), groupId(row.CodigoGrupoProduto), String(row.DescricaoSubGrupoProduto ?? "")]
    );
  }
  return groups.length + subgroups.length;
}

async function importParts(source: Database.Database, target: PoolClient, catalogId: string, assets: AssetResolver): Promise<number> {
  const assemblyIds = new Set((source.prepare("SELECT DISTINCT CodProdConj FROM CONJ_PRODS").all() as Array<{ CodProdConj: unknown }>).map((row) => String(row.CodProdConj)));
  const notes = new Map(
    (source.prepare("SELECT CodigoProduto, Observacao FROM PRODUTO_OBS").all() as Array<Record<string, unknown>>)
      .map((row) => [String(row.CodigoProduto), rtfToPlainText(row.Observacao == null ? null : String(row.Observacao))])
  );
  const rows = source.prepare(`
    SELECT CodigoProduto, NumeroProduto, NumeroProdutoPesq, DescricaoProduto, CodigoGrupoProduto,
           CodigoSubGrupoProduto, ArquivoFotoProduto, CodigoFiguraConj, PCs
    FROM PRODUTO
  `).all() as Array<Record<string, unknown>>;

  for (const row of rows) {
    const partId = String(row.CodigoProduto);
    const photoPath = assets.resolve(row.ArquivoFotoProduto == null ? null : String(row.ArquivoFotoProduto));
    const photoId = photoPath ? `photo:${photoPath}` : null;
    if (photoPath && photoId) {
      await target.query(
        "INSERT INTO asset (catalog_id, asset_id, kind, path, content_type) VALUES ($1, $2, 'photo', $3, $4) ON CONFLICT DO NOTHING",
        [catalogId, photoId, photoPath, contentTypeFor(photoPath)]
      );
    }
    const sourceSubgroup = emptyToNull(row.CodigoSubGrupoProduto);
    await target.query(`
      INSERT INTO part (
        catalog_id, part_id, part_number, part_number_normalized, description, is_obsolete,
        group_id, subgroup_id, photo_id, note, drawing_id, is_assembly
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      catalogId,
      partId,
      String(row.NumeroProduto ?? ""),
      String(row.NumeroProdutoPesq ?? normalizeNumber(String(row.NumeroProduto ?? ""))),
      String(row.DescricaoProduto ?? ""),
      isObsoleteSearchBlob(row.PCs == null ? null : String(row.PCs)),
      sourceSubgroup ? subgroupId(sourceSubgroup) : groupId(row.CodigoGrupoProduto),
      sourceSubgroup ? subgroupId(sourceSubgroup) : null,
      photoId,
      notes.get(partId) ?? null,
      emptyToNull(row.CodigoFiguraConj),
      assemblyIds.has(partId)
    ]);
  }
  return rows.length;
}

async function importManufacturers(source: Database.Database, target: PoolClient, catalogId: string): Promise<number> {
  const rows = source.prepare("SELECT CodigoFabricante, DescricaoFabricante, FlagAplicacao, FlagProduto FROM FABRICANTE").all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    await target.query(
      "INSERT INTO manufacturer (catalog_id, manufacturer_id, name, used_for_vehicles, used_for_cross_reference) VALUES ($1, $2, $3, $4, $5)",
      [catalogId, String(row.CodigoFabricante), String(row.DescricaoFabricante ?? ""), Boolean(Number(row.FlagAplicacao ?? 0)), Boolean(Number(row.FlagProduto ?? 0))]
    );
  }
  return rows.length;
}

async function importVehicleApplications(source: Database.Database, target: PoolClient, catalogId: string): Promise<number> {
  const rows = source.prepare("SELECT CodigoAplicacao, CodigoFabricante, DescricaoAplicacao, ComplementoAplicacao3_1 FROM APLICACAO").all() as Array<Record<string, unknown>>;
  const manufacturerResult = await target.query("SELECT manufacturer_id FROM manufacturer WHERE catalog_id = $1", [catalogId]);
  const manufacturerIds = new Set(manufacturerResult.rows.map((row: { manufacturer_id: unknown }) => String(row.manufacturer_id)));
  for (const row of rows) {
    const yearText = row.ComplementoAplicacao3_1 == null ? null : String(row.ComplementoAplicacao3_1);
    const parsed = parseYearRange(yearText);
    await target.query(
      "INSERT INTO vehicle_application (catalog_id, application_id, manufacturer_id, description, year_from, year_to, year_text) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [catalogId, String(row.CodigoAplicacao), existingIdOrNull(row.CodigoFabricante, manufacturerIds), String(row.DescricaoAplicacao ?? ""), parsed.from, parsed.to, yearText]
    );
  }
  return rows.length;
}

async function importPartApplications(source: Database.Database, target: PoolClient, catalogId: string): Promise<number> {
  const rows = source.prepare("SELECT CodigoProduto, CodigoAplicacao FROM PRODUTO_APLICACAO").all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    await target.query(
      "INSERT INTO part_application (catalog_id, part_id, application_id) VALUES ($1, $2, $3)",
      [catalogId, String(row.CodigoProduto), String(row.CodigoAplicacao)]
    );
  }
  return rows.length;
}

async function importDrawings(source: Database.Database, target: PoolClient, catalogId: string, assets: AssetResolver): Promise<number> {
  const rows = source.prepare("SELECT CodigoFigura, DescricaoFigura, ArquivoFigura FROM FIGURA").all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    const path = assets.resolve(row.ArquivoFigura == null ? null : String(row.ArquivoFigura));
    const assetId = path ? `drawing:${path}` : null;
    if (path && assetId) {
      await target.query(
        "INSERT INTO asset (catalog_id, asset_id, kind, path, content_type) VALUES ($1, $2, 'drawing', $3, $4) ON CONFLICT DO NOTHING",
        [catalogId, assetId, path, contentTypeFor(path)]
      );
    }
    await target.query("INSERT INTO drawing (catalog_id, drawing_id, title, asset_id) VALUES ($1, $2, $3, $4)", [
      catalogId,
      String(row.CodigoFigura),
      emptyToNull(row.DescricaoFigura),
      assetId
    ]);
  }
  return rows.length;
}

async function importDrawingItems(source: Database.Database, target: PoolClient, catalogId: string): Promise<number> {
  const rows = source.prepare("SELECT CodigoFigura, ItemFigura FROM FIGURA_ITENS").all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    const item = emptyToNull(row.ItemFigura);
    if (item) {
      await target.query(
        "INSERT INTO drawing_item (catalog_id, drawing_id, item, label) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [catalogId, String(row.CodigoFigura), item, item]
      );
    }
  }
  return rows.length;
}

async function importAssemblyComponents(source: Database.Database, target: PoolClient, catalogId: string): Promise<number> {
  const rows = source.prepare("SELECT CodProdConj, CodProdComp, ItemFigura, Quantidade FROM CONJ_PRODS").all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    await target.query(
      "INSERT INTO assembly_component (catalog_id, assembly_part_id, component_part_id, drawing_item, quantity) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      [catalogId, String(row.CodProdConj), String(row.CodProdComp), emptyToNull(row.ItemFigura) ?? "", parseQuantity(row.Quantidade)]
    );
  }
  const resolved = source.prepare(`
    SELECT COUNT(*) AS count
    FROM CONJ_PRODS c
    JOIN PRODUTO p ON p.CodigoProduto = c.CodProdConj
    JOIN FIGURA_ITENS fi ON fi.CodigoFigura = p.CodigoFiguraConj
                       AND fi.ItemFigura = c.ItemFigura
  `).get() as { count: number };
  if (resolved.count !== 9676) {
    throw new Error(`Expected 9676 textual drawing links, got ${resolved.count}`);
  }
  return rows.length;
}

async function importCrossReferences(source: Database.Database, target: PoolClient, catalogId: string): Promise<number> {
  const rows = source.prepare("SELECT CodigoReferenciaCruzada, CodigoProduto, CodigoFabricante, NumeroProduto, NumeroProdutoPesq FROM REFERENCIACRUZADA").all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    const number = String(row.NumeroProduto ?? "");
    await target.query(`
      INSERT INTO cross_reference (
        catalog_id, cross_reference_id, part_id, foreign_manufacturer_id, foreign_number, foreign_number_normalized
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [catalogId, String(row.CodigoReferenciaCruzada), String(row.CodigoProduto), String(row.CodigoFabricante), number, String(row.NumeroProdutoPesq ?? normalizeNumber(number))]);
  }
  return rows.length;
}

async function updateManufacturerApplicationCounts(target: PoolClient, catalogId: string): Promise<void> {
  await target.query(`
    UPDATE manufacturer
    SET application_count = (
      SELECT COUNT(*)
      FROM vehicle_application va
      WHERE va.catalog_id = manufacturer.catalog_id
        AND va.manufacturer_id = manufacturer.manufacturer_id
    )
    WHERE catalog_id = $1
  `, [catalogId]);
}

interface AssetResolver {
  resolve(filename: string | null | undefined): string | null;
}

function safeBuildAssetIndex(sourceDir: string): AssetResolver {
  try {
    return buildAssetIndex(sourceDir, ["FotoProd", "Figuras"]);
  } catch {
    return { resolve: () => null };
  }
}

function parseQuantity(value: unknown): number {
  const stringValue = String(value ?? "").trim();
  if (stringValue === "") return 0;
  if (!/^\d+$/.test(stringValue)) {
    throw new Error(`Invalid assembly quantity: ${stringValue}`);
  }
  return Number(stringValue);
}

function groupId(value: unknown): string {
  return `g:${String(value)}`;
}

function subgroupId(value: unknown): string {
  return `s:${String(value)}`;
}

function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const stringValue = String(value).trim();
  return stringValue === "" || stringValue === "0" ? null : stringValue;
}

function existingIdOrNull(value: unknown, allowed: Set<string>): string | null {
  const id = emptyToNull(value);
  return id && allowed.has(id) ? id : null;
}

function contentTypeFor(path: string): string {
  return path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

export { isObsoleteSearchBlob, parseYearRange };
