import type { Question } from "@nexo/contracts/api";
import { recordAskedAttribute, type SlotSet } from "./slots.js";

export interface Discriminator {
  attribute: string;
  values: Array<{ value: string; remainingCount: number }>;
  reduction: number;
}

export type FunnelState =
  | "gathering"
  | "narrowing"
  | "awaiting_answer"
  | "choosing"
  | "resolved"
  | "answering"
  | "released";

export interface FunnelTransition {
  state: FunnelState;
  slotSet: SlotSet;
  question?: Question;
}

const QUESTION_BUDGET = 2;

export function transitionToAwaitingAnswer(slotSet: SlotSet, discriminator: Discriminator): FunnelTransition {
  if (
    discriminator.reduction <= 0 ||
    slotSet.questionsAsked >= QUESTION_BUDGET ||
    slotSet.askedAttributes.includes(discriminator.attribute) ||
    slotSet.declinedAttributes.includes(discriminator.attribute)
  ) {
    return { state: "choosing", slotSet };
  }

  const filteredDiscriminator = filterKnownValues(discriminator, slotSet);
  if (filteredDiscriminator.values.length <= 1) return { state: "choosing", slotSet };

  return {
    state: "awaiting_answer",
    slotSet: recordAskedAttribute(slotSet, discriminator.attribute),
    question: buildQuestion(filteredDiscriminator)
  };
}

export function buildQuestion(discriminator: Discriminator): Question {
  return {
    attribute: discriminator.attribute,
    options: discriminator.values.map((value) => ({ value: value.value, label: value.value })),
    skippable: true
  };
}

function filterKnownValues(discriminator: Discriminator, slotSet: SlotSet): Discriminator {
  const known = knownTokens(slotSet);
  if (known.size === 0) return discriminator;
  return {
    ...discriminator,
    values: discriminator.values.filter((value) => !known.has(fold(value.value)))
  };
}

function knownTokens(slotSet: SlotSet): Set<string> {
  const tokens = new Set<string>();
  for (const slot of Object.values(slotSet.slots)) {
    if (slot.status === "declined") continue;
    if (typeof slot.value !== "string") {
      if (typeof slot.value === "number") tokens.add(String(slot.value));
      continue;
    }
    for (const token of slot.value.split(/[^\p{L}\p{N}]+/u)) {
      if (token) tokens.add(fold(token));
    }
  }
  return tokens;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
