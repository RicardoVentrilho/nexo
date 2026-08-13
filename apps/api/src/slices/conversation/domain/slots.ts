export type SlotName = "manufacturer" | "model" | "variant" | "year" | "partTerm";
export type SlotStatus = "stated" | "confirmed" | "declined";
export type SlotSource = "user_text" | "user_choice";
export type SlotValue = string | number;

export interface Slot {
  value?: SlotValue;
  status: SlotStatus;
  source: SlotSource;
}

export interface SlotSet {
  slots: Partial<Record<SlotName, Slot>>;
  questionsAsked: number;
  askedAttributes: string[];
  declinedAttributes: string[];
}

export type StatedSlots = Partial<Record<SlotName, SlotValue>>;

export function createSlotSet(): SlotSet {
  return { slots: {}, questionsAsked: 0, askedAttributes: [], declinedAttributes: [] };
}

export function mergeStatedSlots(slotSet: SlotSet, stated: StatedSlots): SlotSet {
  const next: SlotSet = copySlotSet(slotSet);
  for (const [name, value] of Object.entries(stated) as Array<[SlotName, SlotValue | undefined]>) {
    if (value === undefined || value === "") continue;
    const current = next.slots[name];
    if (current?.value === value) continue;
    if (name === "manufacturer" || name === "model") {
      delete next.slots.variant;
      delete next.slots.year;
    }
    next.slots[name] = { value, status: "stated", source: "user_text" };
  }
  return next;
}

export function confirmSlot(slotSet: SlotSet, name: SlotName, catalogValue?: SlotValue): SlotSet {
  const current = slotSet.slots[name];
  if (!current && catalogValue === undefined) return copySlotSet(slotSet);
  const value = catalogValue ?? current?.value;
  return withSlot(slotSet, name, {
    ...(value === undefined ? {} : { value }),
    status: "confirmed",
    source: current?.source ?? "user_text"
  });
}

export function declineSlot(slotSet: SlotSet, name: SlotName): SlotSet {
  return withSlot(slotSet, name, { status: "declined", source: "user_choice" });
}

export function recordAskedAttribute(slotSet: SlotSet, attribute: string): SlotSet {
  const next = copySlotSet(slotSet);
  next.questionsAsked += 1;
  if (!next.askedAttributes.includes(attribute)) {
    next.askedAttributes = [...next.askedAttributes, attribute];
  }
  return next;
}

export function recordDeclinedAttribute(slotSet: SlotSet, attribute: string): SlotSet {
  const next = copySlotSet(slotSet);
  if (!next.declinedAttributes.includes(attribute)) {
    next.declinedAttributes = [...next.declinedAttributes, attribute];
  }
  return next;
}

function withSlot(slotSet: SlotSet, name: SlotName, slot: Slot): SlotSet {
  const next = copySlotSet(slotSet);
  next.slots[name] = slot;
  return next;
}

function copySlotSet(slotSet: SlotSet): SlotSet {
  return {
    slots: { ...slotSet.slots },
    questionsAsked: slotSet.questionsAsked,
    askedAttributes: [...slotSet.askedAttributes],
    declinedAttributes: [...slotSet.declinedAttributes]
  };
}
