import type { CatalogReadRepository, VehicleApplication } from "@nexo/catalog-core";
import { ResolveVehicleInput, ResolveVehicleOutput } from "@nexo/contracts/tools";

export class ResolveVehicle {
  constructor(private readonly catalog: CatalogReadRepository) {}

  async execute(input: unknown) {
    const parsed = ResolveVehicleInput.parse(input);
    const result = await this.catalog.resolveVehicle({
      catalogId: parsed.catalog_id,
      model: parsed.model,
      limit: parsed.limit,
      ...(parsed.manufacturer_id ? { manufacturerId: parsed.manufacturer_id } : {}),
      ...(parsed.manufacturer ? { manufacturer: parsed.manufacturer } : {}),
      ...(parsed.year !== undefined ? { year: parsed.year } : {})
    });
    return ResolveVehicleOutput.parse({
      candidates: result.candidates.map(toVehicleCandidate),
      widened: result.widened
    });
  }
}

export function toVehicleCandidate(candidate: VehicleApplication) {
  return {
    application_id: candidate.applicationId,
    description: candidate.description,
    year_text: candidate.yearText,
    year_from: candidate.yearFrom,
    year_to: candidate.yearTo,
    part_count: candidate.partCount
  };
}
