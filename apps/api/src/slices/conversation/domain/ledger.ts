import type { Card } from "@nexo/contracts/api";

export class GroundingLedger {
  private readonly cards: Card[] = [];

  append(kind: Card["kind"], payload: Card["payload"], sourceToolCall: string): Card {
    const card = { cardId: this.cards.length + 1, kind, payload, sourceToolCall };
    this.cards.push(card);
    return card;
  }

  list(): Card[] {
    return [...this.cards];
  }
}
