export interface VehicleApplication {
  catalogId: string;
  applicationId: string;
  manufacturerId: string | null;
  description: string;
  yearFrom: number | null;
  yearTo: number | null;
  yearText: string | null;
}

export function applicationMatchesYear(application: VehicleApplication, year: number): boolean {
  return (
    (application.yearFrom === null || year >= application.yearFrom) &&
    (application.yearTo === null || year <= application.yearTo)
  );
}
