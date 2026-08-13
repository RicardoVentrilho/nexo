export function normalizeNumber(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
