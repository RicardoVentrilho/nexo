import type { Card, Notice } from "@nexo/contracts/api";

const CATALOG_IDENTIFIER = /\b[A-Z]{1,4}-?\d{2,}(?:-?\d+)*\b/g;
const CARD_REFERENCE = /\[\[card:\d+\]\]/g;
const IDENTIFIER_KEYS = new Set([
  "application_id",
  "part_id",
  "part_number",
  "part_number_normalized",
  "manufacturer_id",
  "group_id",
  "foreign_number"
]);

export function validateGrounding(prose: string, cards: Card[]): { prose: string; notices: Notice[] } {
  const proseWithoutCardRefs = prose.replace(CARD_REFERENCE, "");
  const groundedIdentifiers = collectCardIdentifiers(cards);
  const leakedGroundedIdentifiers = groundedIdentifiers.filter((identifier) => proseWithoutCardRefs.includes(identifier));
  if (leakedGroundedIdentifiers.length > 0) {
    return rejected();
  }

  const identifiers = proseWithoutCardRefs.match(CATALOG_IDENTIFIER) ?? [];
  if (identifiers.length === 0) return { prose, notices: [] };
  const cardText = JSON.stringify(cards);
  const ungrounded = identifiers.filter((identifier) => !cardText.includes(identifier));
  if (ungrounded.length === 0) return { prose, notices: [] };

  return rejected();
}

function rejected(): { prose: string; notices: Notice[] } {
  return {
    prose: "Encontrei dados estruturados do catalogo, mas removi a resposta textual porque ela continha um identificador nao confirmado.",
    notices: [{ code: "grounding_violation", message: "Resposta textual continha identificador sem card de origem." }]
  };
}

function collectCardIdentifiers(cards: Card[]): string[] {
  const identifiers = new Set<string>();
  for (const card of cards) collectIdentifiers(card.payload, identifiers);
  return [...identifiers].filter((identifier) => identifier.length >= 2);
}

function collectIdentifiers(value: unknown, identifiers: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectIdentifiers(item, identifiers);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [childKey, childValue] of Object.entries(value)) {
    if (IDENTIFIER_KEYS.has(childKey) && (typeof childValue === "string" || typeof childValue === "number")) {
      identifiers.add(String(childValue));
      continue;
    }
    collectIdentifiers(childValue, identifiers);
  }
}
