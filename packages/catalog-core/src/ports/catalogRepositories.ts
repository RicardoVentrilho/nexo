import type {
  Asset,
  Manufacturer,
  Part,
  ProductGroup,
  VehicleApplication
} from "../entities/index.js";

export interface SearchPartsQuery {
  catalogId: string;
  query: string;
  applicationId?: string;
  groupId?: string;
  limit: number;
}

export interface CatalogReadRepository {
  searchParts(query: SearchPartsQuery): Promise<{ parts: Part[]; total: number }>;
  getPart(input: { catalogId: string; partId?: string; partNumber?: string }): Promise<Part | null>;
  listGroups(input: { catalogId: string; parentGroupId?: string | null; applicationId?: string }): Promise<Array<ProductGroup & { partCount: number }>>;
  resolveVehicle(input: { catalogId: string; model: string; manufacturerId?: string; manufacturer?: string; year?: number; limit: number }): Promise<{ candidates: VehicleApplication[]; widened: boolean }>;
  listManufacturers(input: { catalogId: string; scope: "vehicle" | "cross_reference"; search?: string; limit: number }): Promise<Array<Manufacturer & { applicationCount: number }>>;
  listVehicleModels(input: { catalogId: string; manufacturerId: string; search?: string; limit: number }): Promise<{ models: Array<{ description: string; applicationCount: number; yearSpanText: string | null }>; truncated: boolean }>;
  getAssemblies(input: { catalogId: string; partId: string }): Promise<{
    parentAssemblies: Array<Part & { quantity?: number; drawingItem?: string | null }>;
    components: Array<Part & { quantity?: number; drawingItem?: string | null }>;
    sameDrawing: Part[];
  }>;
  findCrossReference(input: { catalogId: string; foreignNumber: string }): Promise<Array<Part & { foreignManufacturerName: string; foreignNumber: string }>>;
  getAsset(input: { catalogId: string; assetId: string }): Promise<Asset | null>;
}
