import { z } from "zod";
import { CatalogId, ManufacturerId } from "../primitives.js";
import { Limit, VehicleModelRef } from "./common.js";

export const ListVehicleModelsInput = z.object({
  manufacturer_id: ManufacturerId,
  search: z.string().optional(),
  catalog_id: CatalogId.default("eaton"),
  limit: Limit.default(25)
});

export const ListVehicleModelsOutput = z.object({
  models: z.array(VehicleModelRef.omit({ manufacturer_id: true })),
  truncated: z.boolean()
});
