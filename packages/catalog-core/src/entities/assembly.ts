export interface AssemblyComponent {
  catalogId: string;
  assemblyPartId: string;
  componentPartId: string;
  drawingItem: string | null;
  quantity: number;
}

export interface Drawing {
  catalogId: string;
  drawingId: string;
  title: string | null;
  assetId: string | null;
}

export interface DrawingItem {
  catalogId: string;
  drawingId: string;
  item: string;
  label: string | null;
}
