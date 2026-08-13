import type { Principal } from "../../identity/application/authoriseRequest.js";
import type { Question } from "@nexo/contracts/api";
import { createSlotSet, type SlotSet } from "../domain/slots.js";

export interface SessionState {
  sessionId: string;
  principal: Principal;
  slotSet: SlotSet;
  currentApplicationId?: string;
  currentPartId?: string;
  awaitingQuestion?: Question;
  pendingQuestionTelemetry?: {
    attribute: string;
    candidateCountBefore: number;
  };
  lastVehicleCandidates?: Array<{ application_id?: string; description?: string; year_text?: string | null; part_count?: number }>;
  inFlight: boolean;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  getOrCreate(sessionId: string, principal: Principal): SessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const created: SessionState = { sessionId, principal, slotSet: createSlotSet(), inFlight: false };
    this.sessions.set(sessionId, created);
    return created;
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
