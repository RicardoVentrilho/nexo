import type { CatalogReadRepository } from "@nexo/catalog-core";
import { ListVehicleModelsInput, ListVehicleModelsOutput } from "@nexo/contracts/tools";

export class ListVehicleModels {
  constructor(private readonly catalog: CatalogReadRepository) {}

  async execute(input: unknown) {
    const parsed = ListVehicleModelsInput.parse(input);
    return ListVehicleModelsOutput.parse(await this.catalog.listVehicleModels({
      catalogId: parsed.catalog_id,
      manufacturerId: parsed.manufacturer_id,
      limit: parsed.limit,
      ...(parsed.search ? { search: parsed.search } : {})
    }));
  }
}
