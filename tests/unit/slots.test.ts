import { describe, expect, it } from "vitest";
import {
  confirmSlot,
  createSlotSet,
  declineSlot,
  mergeStatedSlots,
  recordAskedAttribute,
  recordDeclinedAttribute,
  type SlotSet
} from "../../apps/api/src/slices/conversation/domain/slots.js";

describe("slot set", () => {
  it("merges extracted values as stated user text", () => {
    const slots = mergeStatedSlots(createSlotSet(), {
      manufacturer: "Ford",
      model: "Cargo 2422",
      partTerm: "embreagem"
    });

    expect(slots.slots.manufacturer).toEqual({ value: "Ford", status: "stated", source: "user_text" });
    expect(slots.slots.model).toEqual({ value: "Cargo 2422", status: "stated", source: "user_text" });
    expect(slots.slots.partTerm).toEqual({ value: "embreagem", status: "stated", source: "user_text" });
  });

  it("moves stated slots to confirmed with catalog spelling", () => {
    const slots = mergeStatedSlots(createSlotSet(), { manufacturer: "ford" });

    const confirmed = confirmSlot(slots, "manufacturer", "FORD");

    expect(confirmed.slots.manufacturer).toEqual({ value: "FORD", status: "confirmed", source: "user_text" });
  });

  it("marks a declined answer distinctly from an absent slot", () => {
    const slots = declineSlot(createSlotSet(), "year");

    expect(slots.slots.year).toEqual({ status: "declined", source: "user_choice" });
  });

  it("replacing a value resets only that slot to stated", () => {
    const established: SlotSet = {
      slots: {
        manufacturer: { value: "FORD", status: "confirmed", source: "user_text" },
        model: { value: "Cargo 2422", status: "confirmed", source: "user_text" },
        partTerm: { value: "embreagem", status: "confirmed", source: "user_text" }
      },
      questionsAsked: 1,
      askedAttributes: ["variant"],
      declinedAttributes: []
    };

    const replaced = mergeStatedSlots(established, { model: "Cargo 1723" });

    expect(replaced.slots.model).toEqual({ value: "Cargo 1723", status: "stated", source: "user_text" });
    expect(replaced.slots.manufacturer).toBe(established.slots.manufacturer);
    expect(replaced.slots.partTerm).toBe(established.slots.partTerm);
    expect(replaced.questionsAsked).toBe(1);
    expect(replaced.askedAttributes).toEqual(["variant"]);
  });

  it("clears dependent variant and year when manufacturer or model changes but keeps part term", () => {
    const established: SlotSet = {
      slots: {
        manufacturer: { value: "FORD", status: "confirmed", source: "user_text" },
        model: { value: "Cargo 2422", status: "confirmed", source: "user_text" },
        variant: { value: "6x4", status: "confirmed", source: "user_choice" },
        year: { value: 2011, status: "confirmed", source: "user_text" },
        partTerm: { value: "embreagem", status: "confirmed", source: "user_text" }
      },
      questionsAsked: 1,
      askedAttributes: ["description_token"],
      declinedAttributes: []
    };

    const replaced = mergeStatedSlots(established, { model: "Cargo 1723" });

    expect(replaced.slots.model).toEqual({ value: "Cargo 1723", status: "stated", source: "user_text" });
    expect(replaced.slots.variant).toBeUndefined();
    expect(replaced.slots.year).toBeUndefined();
    expect(replaced.slots.partTerm).toBe(established.slots.partTerm);
  });

  it("tracks asked and declined attributes without duplicates", () => {
    const asked = recordAskedAttribute(recordAskedAttribute(createSlotSet(), "description_token"), "description_token");
    const declined = recordDeclinedAttribute(recordDeclinedAttribute(asked, "description_token"), "description_token");

    expect(declined.questionsAsked).toBe(2);
    expect(declined.askedAttributes).toEqual(["description_token"]);
    expect(declined.declinedAttributes).toEqual(["description_token"]);
  });
});
