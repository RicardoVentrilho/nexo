import type { CatalogReadRepository } from "@nexo/catalog-core";
import { FindCrossReferenceInput, FindCrossReferenceOutput } from "@nexo/contracts/tools";

export class FindCrossReference {
  constructor(private readonly catalog: CatalogReadRepository) {}

  async execute(input: unknown) {
    const parsed = FindCrossReferenceInput.parse(input);
    const matches = await this.catalog.findCrossReference({
      catalogId: parsed.catalog_id,
      foreignNumber: parsed.foreign_number
    });
    return FindCrossReferenceOutput.parse({
      matches: matches.map((match) => ({
        part_id: match.partId,
        part_number: match.partNumber,
        description: match.description,
        foreign_manufacturer_name: match.foreignManufacturerName,
        foreign_number: match.foreignNumber,
        is_obsolete: match.isObsolete,
        has_photo: match.photoId !== null
      }))
    });
  }
}
