import { z } from "zod";
import { ApplicationId, CatalogId } from "../primitives.js";
import { Limit, PartResult } from "./common.js";

export const SearchPartsInput = z.object({
  query: z.string().min(1),
  application_id: ApplicationId.optional(),
  vehicle_text: z.string().optional(),
  year: z.number().int().optional(),
  group_id: z.string().optional(),
  catalog_id: CatalogId.default("eaton"),
  limit: Limit
}).refine((value) => !(value.application_id && value.vehicle_text), {
  message: "application_id and vehicle_text cannot both be supplied"
});

export const SearchPartsOutput = z.object({
  parts: z.array(PartResult),
  total: z.number().int().nonnegative()
});
