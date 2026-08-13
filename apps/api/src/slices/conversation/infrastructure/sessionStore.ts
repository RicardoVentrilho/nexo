import type { Principal } from "../../identity/application/authoriseRequest.js";

export interface SessionState {
  sessionId: string;
  principal: Principal;
  currentManufacturerId?: string;
  currentVehicleModel?: string;
  currentApplicationId?: string;
  currentPartId?: string;
  pendingPartQuery?: string;
  lastVehicleCandidates?: Array<{ application_id?: string; description?: string; year_text?: string | null }>;
  inFlight: boolean;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  getOrCreate(sessionId: string, principal: Principal): SessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const created: SessionState = { sessionId, principal, inFlight: false };
    this.sessions.set(sessionId, created);
    return created;
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
