import { z } from "zod";
import { CatalogId, PartId } from "../primitives.js";
import { PartResult } from "./common.js";

const AssemblyPart = PartResult.omit({ group: true, subgroup: true, is_assembly: true, catalog_id: true }).extend({
  quantity: z.number().int().nonnegative().optional(),
  drawing_item: z.string().nullable().optional()
});

export const GetAssembliesInput = z.object({
  part_id: PartId,
  catalog_id: CatalogId.default("eaton")
});

export const GetAssembliesOutput = z.object({
  parent_assemblies: z.array(AssemblyPart),
  components: z.array(AssemblyPart),
  same_drawing: z.array(AssemblyPart)
});
