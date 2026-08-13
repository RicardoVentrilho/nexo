import type { CatalogReadRepository, Part } from "@nexo/catalog-core";
import { GetAssembliesInput, GetAssembliesOutput } from "@nexo/contracts/tools";

export class GetAssemblies {
  constructor(private readonly catalog: CatalogReadRepository) {}

  async execute(input: unknown) {
    const parsed = GetAssembliesInput.parse(input);
    const result = await this.catalog.getAssemblies({
      catalogId: parsed.catalog_id,
      partId: parsed.part_id
    });
    return GetAssembliesOutput.parse({
      parent_assemblies: result.parentAssemblies.map(toAssemblyPart),
      components: result.components.map(toAssemblyPart),
      same_drawing: result.sameDrawing.map(toAssemblyPart)
    });
  }
}

function toAssemblyPart(part: Part & { quantity?: number; drawingItem?: string | null }) {
  return {
    part_id: part.partId,
    part_number: part.partNumber,
    description: part.description,
    is_obsolete: part.isObsolete,
    has_photo: part.photoId !== null,
    quantity: part.quantity,
    drawing_item: part.drawingItem
  };
}
