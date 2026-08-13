import { z } from "zod";
import { CatalogId, PartId, PartNumber } from "../primitives.js";
import { PartResult, VehicleCandidate } from "./common.js";

export const GetPartInput = z.object({
  part_id: PartId.optional(),
  part_number: PartNumber.optional(),
  catalog_id: CatalogId.default("eaton")
}).refine((value) => Boolean(value.part_id) !== Boolean(value.part_number), {
  message: "Exactly one of part_id or part_number is required"
});

export const GetPartOutput = PartResult.extend({
  note: z.string().nullable().optional(),
  drawing_id: z.string().nullable().optional(),
  applications: z.array(VehicleCandidate)
});
