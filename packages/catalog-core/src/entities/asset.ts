export type AssetKind = "photo" | "drawing";

export interface Asset {
  catalogId: string;
  assetId: string;
  kind: AssetKind;
  path: string;
  contentType: string;
}
