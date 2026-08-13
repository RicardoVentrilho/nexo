import type { Part } from "@nexo/catalog-core";

export interface AssemblyPart extends Part {
  quantity?: number;
  drawingItem?: string | null;
}
