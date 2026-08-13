import { describe, expect, it } from "vitest";
import { TurnResponse } from "../../packages/contracts/src/api/index.js";

const baseResponse = {
  turnId: "turn-1",
  prose: "Qual variante?",
  cards: [],
  notices: []
};

describe("turn response shape", () => {
  it("requires question exactly when state is needs_input", () => {
    expect(TurnResponse.safeParse({
      ...baseResponse,
      state: "needs_input",
      question: {
        attribute: "variant",
        options: [{ value: "6x4", label: "6x4" }],
        skippable: true
      }
    }).success).toBe(true);

    expect(TurnResponse.safeParse({
      ...baseResponse,
      state: "needs_input"
    }).success).toBe(false);

    expect(TurnResponse.safeParse({
      ...baseResponse,
      state: "released",
      question: {
        attribute: "variant",
        options: [{ value: "6x4", label: "6x4" }],
        skippable: true
      }
    }).success).toBe(false);
  });
});
