export function isObsoleteSearchBlob(value: string | null | undefined): boolean {
  return typeof value === "string" && /PECA OBSOLETA/i.test(value);
}
