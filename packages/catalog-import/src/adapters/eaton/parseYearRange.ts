export interface ParsedYearRange {
  from: number | null;
  to: number | null;
}

export function parseYearRange(input: string | null | undefined): ParsedYearRange {
  const text = (input ?? "").trim();
  const lowered = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0]));

  if (text === "" || lowered === "todos" || lowered === "-" || years.length === 0) {
    return { from: null, to: null };
  }

  if (lowered.includes("ate") && years.length === 1) {
    return { from: null, to: years[0] ?? null };
  }

  if (
    (lowered.includes("a partir") || lowered.includes("em diante") || /\b(?:19|20)\d{2}\/(?:\.\.\.)?$/.test(text)) &&
    years.length === 1
  ) {
    return { from: years[0] ?? null, to: null };
  }

  if (years.length >= 2) {
    return { from: Math.min(...years), to: Math.max(...years) };
  }

  return { from: null, to: null };
}
