import type { CatalogReadRepository } from "@nexo/catalog-core";
import { GetPartInput, GetPartOutput } from "@nexo/contracts/tools";
import { toPartResult } from "./searchParts.js";

export class GetPart {
  constructor(private readonly catalog: CatalogReadRepository) {}

  async execute(input: unknown) {
    const parsed = GetPartInput.parse(input);
    const part = await this.catalog.getPart({
      catalogId: parsed.catalog_id,
      ...(parsed.part_id ? { partId: parsed.part_id } : {}),
      ...(parsed.part_number ? { partNumber: parsed.part_number } : {})
    });
    if (!part) throw new Error("not_found");
    return GetPartOutput.parse({
      ...toPartResult(part),
      note: part.note,
      drawing_id: part.drawingId,
      applications: []
    });
  }
}
