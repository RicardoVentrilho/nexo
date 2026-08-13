import { z } from "zod";
import { ApplicationId, CatalogId, ManufacturerId, PartId, PartNumber } from "../primitives.js";

export const Limit = z.number().int().positive().max(100).default(10);

export const VehicleCandidate = z.object({
  application_id: ApplicationId,
  description: z.string(),
  manufacturer_name: z.string().optional(),
  year_text: z.string().nullable().optional(),
  year_from: z.number().int().nullable().optional(),
  year_to: z.number().int().nullable().optional()
});

export const PartResult = z.object({
  catalog_id: CatalogId.optional(),
  part_id: PartId,
  part_number: PartNumber,
  description: z.string(),
  group: z.string().nullable(),
  subgroup: z.string().nullable().optional(),
  is_assembly: z.boolean(),
  is_obsolete: z.boolean(),
  has_photo: z.boolean(),
  photo_asset_id: z.string().nullable().optional()
});

export const ManufacturerRef = z.object({
  manufacturer_id: ManufacturerId,
  name: z.string(),
  application_count: z.number().int().nonnegative()
});

export const VehicleModelRef = z.object({
  manufacturer_id: ManufacturerId.optional(),
  description: z.string(),
  application_count: z.number().int().nonnegative(),
  year_span_text: z.string().nullable()
});

export const GroupRef = z.object({
  group_id: z.string(),
  description: z.string(),
  part_count: z.number().int().nonnegative()
});

export type VehicleCandidate = z.infer<typeof VehicleCandidate>;
export type PartResult = z.infer<typeof PartResult>;
export type ManufacturerRef = z.infer<typeof ManufacturerRef>;
export type VehicleModelRef = z.infer<typeof VehicleModelRef>;
export type GroupRef = z.infer<typeof GroupRef>;
