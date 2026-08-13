# Contract — Web ↔ Internal API

> **Amended by feature 002**: the current conversation turn contract widens `state`, adds
> `question`, `part_count`, and new notice codes. Read this baseline together with
> [002/contracts/web-api-delta.md](../../002-slot-driven-funnel/contracts/web-api-delta.md).

**Consumer**: `apps/web` (server side only — the browser never calls this directly).
**Provider**: `apps/api`, internal ingress only (FR-004).
**Auth**: every request carries the user's bearer token, validated against Keycloak's JWKS.
No route is anonymous.
**Schemas**: zod in `packages/contracts/src/api/`, shared by both sides.

---

## `POST /v1/conversations/:sessionId/turns`

Run one conversation turn. This is the only route that reaches the model or the catalog.

**Request**: `{ message: string }`

**Response** — `200`
```
{
  turnId: string,          // also the trace id (SC-005)
  prose: string,           // model text; contains [[card:N]] references, never bare identifiers
  cards: Card[],           // the grounding ledger for this turn
  notices: Notice[],       // e.g. year_widened, no_results, catalog_unavailable, truncated
  state: "released" | "needs_choice"
}
```

`Card` = `{ cardId, kind: "part" | "vehicle_candidate" | "assembly" | "cross_reference" |
"manufacturer" | "vehicle_model" | "group",
payload, sourceToolCall }`. Payload shapes are exactly the MCP tool result shapes — the API
does not reshape catalog data on the way out, so there is one definition of a part.

`state: "needs_choice"` means the turn is waiting on the user to pick a vehicle candidate
(FR-010). The client renders the candidate cards as selectable; the choice is sent as the next
turn's message.

**Grounding failure**: if the validator finds a catalog identifier in prose that resolves to no
card (R1), the API returns `200` with the cards intact, `prose` replaced by a neutral statement,
and a `grounding_violation` notice. The event is recorded as a span error. **A suspected
fabrication is never forwarded to the user** — the requirement is that it not reach them, not
that it be labelled.

Errors: `401` unauthenticated · `403` role · `404` unknown session · `429` turn already in
flight for this session · `503` catalog or model unavailable.

---

## `GET /v1/assets/:catalogId/:assetId`

Authenticated passthrough for photos and drawings. Streams bytes with the stored content type.
This is what lets images reach the browser while the MCP server stays unreachable from it (R4).

`404` when the asset is absent — a normal outcome, since ~93% of parts have no photo. The client
renders the textual record; it does not present an error (FR-011, edge cases).

---

## `GET /v1/session`

Returns `{ subject, displayName, roles }` for the current token. The web app uses it to render
identity and to gate administrator-only affordances — display only. **Authorisation decisions
are made server-side on every route** (FR-003); this endpoint is not an authorisation mechanism.

---

## `GET /health` · `GET /ready`

Unauthenticated, internal ingress only. `/ready` reports catalog reachability and model
configuration validity. Used by Container Apps probes.

---

## Cross-cutting

**Tracing** — every request continues the W3C trace context started in the web application, so a
turn is one trace across web → API → MCP (FR-023). `turnId` equals the trace id, which is what
makes an operator's search in Kibana a single lookup rather than a correlation exercise.

**Telemetry boundary** — request logs record route, status, duration, `turnId`, and subject.
They do **not** record `message` or `prose` (R5, FR-017).

**Rate limiting** — one in-flight turn per session (`429`). This is back-pressure on model cost
and on the 4-round tool loop, not a security control.

---

## Contract tests

Turn shape round-trip · unauthenticated request rejected on every route · role check enforced
server-side even when the client omits its own gating · asset `404` renders as a normal result ·
**issuer assertion**: a freshly minted token's `iss` equals the public origin, which is the
failure mode R2 flags for the Keycloak proxy · **grounding violation**: an engineered prompt that
elicits a fabricated number produces a `grounding_violation` notice and no fabricated number in
`prose`.
