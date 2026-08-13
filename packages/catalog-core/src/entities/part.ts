export interface Part {
  catalogId: string;
  partId: string;
  partNumber: string;
  partNumberNormalized: string;
  description: string;
  groupId: string | null;
  subgroupId: string | null;
  photoId: string | null;
  note: string | null;
  drawingId: string | null;
  isAssembly: boolean;
  isObsolete: boolean;
}
