import type { CatalogReadRepository } from "@nexo/catalog-core";
import { ListManufacturersInput, ListManufacturersOutput } from "@nexo/contracts/tools";

export class ListManufacturers {
  constructor(private readonly catalog: CatalogReadRepository) {}

  async execute(input: unknown) {
    const parsed = ListManufacturersInput.parse(input);
    const manufacturers = await this.catalog.listManufacturers({
      catalogId: parsed.catalog_id,
      scope: parsed.scope,
      limit: parsed.limit,
      ...(parsed.search ? { search: parsed.search } : {})
    });
    return ListManufacturersOutput.parse({
      manufacturers: manufacturers.map((manufacturer) => ({
        manufacturer_id: manufacturer.manufacturerId,
        name: manufacturer.name,
        application_count: manufacturer.applicationCount
      }))
    });
  }
}
