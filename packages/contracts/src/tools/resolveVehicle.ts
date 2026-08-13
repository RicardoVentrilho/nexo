import { z } from "zod";
import { CatalogId, ManufacturerId } from "../primitives.js";
import { Limit, VehicleCandidate } from "./common.js";

export const ResolveVehicleInput = z.object({
  model: z.string().min(1),
  manufacturer_id: ManufacturerId.optional(),
  manufacturer: z.string().optional(),
  year: z.number().int().optional(),
  catalog_id: CatalogId.default("eaton"),
  limit: Limit
});

export const ResolveVehicleOutput = z.object({
  candidates: z.array(VehicleCandidate),
  widened: z.boolean()
});
