import { describe, expect, it } from "vitest";
import type { CatalogReadRepository } from "../../packages/catalog-core/src/ports/catalogRepositories.js";
import { ResolveVehicle } from "../../apps/mcp/src/slices/vehicle-resolution/application/resolveVehicle.js";

describe("resolve_vehicle contract", () => {
  it("maps repository part counts into vehicle candidates", async () => {
    const tool = new ResolveVehicle({
      async resolveVehicle() {
        return {
          candidates: [{
            catalogId: "eaton",
            applicationId: "16049",
            manufacturerId: "2",
            description: "Cargo 2422 6x4",
            yearFrom: null,
            yearTo: null,
            yearText: "Todos",
            partCount: 18
          }],
          widened: false
        };
      }
    } as CatalogReadRepository);

    await expect(tool.execute({ catalog_id: "eaton", model: "Cargo 2422", limit: 5 })).resolves.toEqual({
      candidates: [{
        application_id: "16049",
        description: "Cargo 2422 6x4",
        year_text: "Todos",
        year_from: null,
        year_to: null,
        part_count: 18
      }],
      widened: false
    });
  });
});
