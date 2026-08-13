import { describe, expect, it } from "vitest";
import { createSlotSet, mergeStatedSlots, type SlotSet } from "../../apps/api/src/slices/conversation/domain/slots.js";
import { buildQuestion, transitionToAwaitingAnswer } from "../../apps/api/src/slices/conversation/domain/funnel.js";

describe("funnel transitions", () => {
  it("enters awaiting_answer only when the discriminator reduces candidates", () => {
    const slotSet = createSlotSet();

    const transition = transitionToAwaitingAnswer(slotSet, {
      attribute: "variant",
      values: [{ value: "6x4", remainingCount: 1 }, { value: "6x2", remainingCount: 3 }],
      reduction: 4
    });

    expect(transition.state).toBe("awaiting_answer");
    expect(transition.slotSet.questionsAsked).toBe(1);
    expect(transition.slotSet.askedAttributes).toEqual(["variant"]);
  });

  it("does not ask a question with zero reduction", () => {
    const transition = transitionToAwaitingAnswer(createSlotSet(), {
      attribute: "year",
      values: [{ value: "Todos", remainingCount: 21 }],
      reduction: 0
    });

    expect(transition.state).toBe("choosing");
    expect(transition.slotSet.questionsAsked).toBe(0);
  });

  it("hard-bounds the question budget at two", () => {
    const slotSet: SlotSet = { slots: {}, questionsAsked: 2, askedAttributes: ["variant", "year"] };

    const transition = transitionToAwaitingAnswer(slotSet, {
      attribute: "cabine",
      values: [{ value: "simples", remainingCount: 1 }, { value: "dupla", remainingCount: 2 }],
      reduction: 2
    });

    expect(transition.state).toBe("choosing");
    expect(transition.slotSet.questionsAsked).toBe(2);
    expect(transition.slotSet.askedAttributes).toEqual(["variant", "year"]);
  });

  it("builds questions from discriminator values only", () => {
    const question = buildQuestion({
      attribute: "variant",
      values: [{ value: "6x4", remainingCount: 1 }, { value: "6x2", remainingCount: 3 }],
      reduction: 4
    });

    expect(question).toEqual({
      attribute: "variant",
      options: [{ value: "6x4", label: "6x4" }, { value: "6x2", label: "6x2" }],
      skippable: true
    });
  });

  it("does not ask an attribute that was already asked or declined", () => {
    const asked = transitionToAwaitingAnswer({
      slots: {},
      questionsAsked: 0,
      askedAttributes: ["description_token"],
      declinedAttributes: []
    }, {
      attribute: "description_token",
      values: [{ value: "6x4", remainingCount: 1 }, { value: "6x2", remainingCount: 2 }],
      reduction: 2
    });
    const declined = transitionToAwaitingAnswer({
      slots: {},
      questionsAsked: 0,
      askedAttributes: [],
      declinedAttributes: ["description_token"]
    }, {
      attribute: "description_token",
      values: [{ value: "6x4", remainingCount: 1 }, { value: "6x2", remainingCount: 2 }],
      reduction: 2
    });

    expect(asked.state).toBe("choosing");
    expect(declined.state).toBe("choosing");
  });

  it("does not offer values already present in stated slots", () => {
    const transition = transitionToAwaitingAnswer(mergeStatedSlots(createSlotSet(), { model: "Cargo 2422" }), {
      attribute: "description_token",
      values: [
        { value: "2422", remainingCount: 8 },
        { value: "6x2", remainingCount: 3 },
        { value: "6x4", remainingCount: 2 }
      ],
      reduction: 8
    });

    expect(transition.question?.options.map((option) => option.value)).toEqual(["6x2", "6x4"]);
  });
});
