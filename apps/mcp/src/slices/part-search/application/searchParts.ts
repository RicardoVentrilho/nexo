import type { CatalogReadRepository, Part } from "@nexo/catalog-core";
import { SearchPartsInput, SearchPartsOutput } from "@nexo/contracts/tools";

export class SearchParts {
  constructor(private readonly catalog: CatalogReadRepository) {}

  async execute(input: unknown) {
    const parsed = SearchPartsInput.parse(input);
    const result = await this.catalog.searchParts({
      catalogId: parsed.catalog_id,
      query: parsed.query,
      limit: parsed.limit,
      ...(parsed.application_id ? { applicationId: parsed.application_id } : {}),
      ...(parsed.group_id ? { groupId: parsed.group_id } : {})
    });
    return SearchPartsOutput.parse({
      parts: result.parts.map(toPartResult),
      total: result.total
    });
  }
}

export function toPartResult(part: Part) {
  return {
    catalog_id: part.catalogId,
    part_id: part.partId,
    part_number: part.partNumber,
    description: part.description,
    group: part.groupId,
    subgroup: part.subgroupId,
    is_assembly: part.isAssembly,
    is_obsolete: part.isObsolete,
    has_photo: part.photoId !== null,
    photo_asset_id: part.photoId
  };
}
