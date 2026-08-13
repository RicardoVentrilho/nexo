import { z } from "zod";
import { CatalogId } from "../primitives.js";
import { Limit, ManufacturerRef } from "./common.js";

export const ListManufacturersInput = z.object({
  scope: z.enum(["vehicle", "cross_reference"]),
  search: z.string().optional(),
  catalog_id: CatalogId.default("eaton"),
  limit: Limit.default(50)
});

export const ListManufacturersOutput = z.object({
  manufacturers: z.array(ManufacturerRef)
});
