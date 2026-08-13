import type { VehicleApplication } from "@nexo/catalog-core";

export function matchesYear(application: Pick<VehicleApplication, "yearFrom" | "yearTo">, year: number): boolean {
  return (
    (application.yearFrom === null || year >= application.yearFrom) &&
    (application.yearTo === null || year <= application.yearTo)
  );
}
