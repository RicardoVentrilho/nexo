const STOPWORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas",
  "para", "pra", "pro", "por", "com", "que", "qual", "quais", "meu", "minha", "esse", "essa", "este", "esta",
  "preciso", "quero", "queria", "gostaria", "tem", "temos", "ter", "achar", "buscar", "procuro", "procurar",
  "me", "mostra", "mostrar", "ver", "sobre", "ai", "voce", "voces"
]);

const VEHICLE_WORDS = new Set([
  "cargo", "caminhao", "caminhoes", "onibus", "microonibus", "trator",
  "ford", "volkswagen", "vw", "mercedes", "benz", "mb", "volvo", "iveco", "scania", "agrale", "gm", "fiat"
]);

/** Strips conversational noise and vehicle words, leaving the part term the catalog can be searched by. */
export function extractPartQuery(query: string): string {
  const terms = query
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .filter((word) => !isNoise(word));
  return terms.join(" ") || query;
}

function isNoise(word: string): boolean {
  const folded = word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
  if (folded.length === 0) return true;
  if (/^\d+$/.test(folded)) return true;
  if (/^\d+x\d+$/.test(folded)) return true;
  return STOPWORDS.has(folded) || VEHICLE_WORDS.has(folded);
}
