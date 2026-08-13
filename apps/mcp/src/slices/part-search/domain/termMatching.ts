export function toSearchTerms(query: string): string[] {
  return query.split(/\s+/).filter((term) => term.length > 0);
}

/** One pattern per query term: a description matches only when it contains all of them, in any order. */
export function toDescriptionPatterns(query: string): string[] {
  const terms = toSearchTerms(query);
  return terms.length > 0 ? terms.map((term) => `%${foldAccent(term)}%`) : [`%${foldAccent(query)}%`];
}

function foldAccent(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
