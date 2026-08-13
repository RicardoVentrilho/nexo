export function rtfToPlainText(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return value
      .replace(/\\'[0-9a-fA-F]{2}/g, " ")
      .replace(/\\[a-z]+-?\d* ?/gi, "")
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim() || null;
  } catch {
    return null;
  }
}
