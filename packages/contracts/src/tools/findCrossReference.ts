import { z } from "zod";
import { CatalogId } from "../primitives.js";

export const FindCrossReferenceInput = z.object({
  foreign_number: z.string().min(1),
  catalog_id: CatalogId.default("eaton")
});

export const FindCrossReferenceOutput = z.object({
  matches: z.array(z.object({
    part_id: z.string(),
    part_number: z.string(),
    description: z.string(),
    foreign_manufacturer_name: z.string(),
    foreign_number: z.string(),
    is_obsolete: z.boolean(),
    has_photo: z.boolean()
  }))
});
