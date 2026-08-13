import { z } from "zod";

export const CatalogId = z.string().min(1);
export const PartId = z.string().min(1);
export const ApplicationId = z.string().min(1);
export const ManufacturerId = z.string().min(1);
export const PartNumber = z.string().min(1);

export type CatalogId = z.infer<typeof CatalogId>;
export type PartId = z.infer<typeof PartId>;
export type ApplicationId = z.infer<typeof ApplicationId>;
export type ManufacturerId = z.infer<typeof ManufacturerId>;
export type PartNumber = z.infer<typeof PartNumber>;
