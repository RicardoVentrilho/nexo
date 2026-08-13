# Phase 1 — Data Model: Conversation State

This feature adds **no catalog schema**. The canonical catalog model defined in
[`001/data-model.md`](../001-authenticated-chat-platform/data-model.md) is unchanged; the only
database change is the creation of the `pg_trgm` and `unaccent` extensions by the import pipeline
(research R3).

What follows is the in-memory, session-scoped state of a conversation. It is never persisted
(`001` FR-017) and never leaves the API except in the shapes defined in
[`contracts/web-api-delta.md`](./contracts/web-api-delta.md).

---

## Slot

One named piece of the request. Five slots exist; all are optional.

| Field | Type | Notes |
|---|---|---|
| `value` | string \| number | The value as it will be used in a lookup. `year` is numeric; the rest are text. |
| `status` | `"stated"` \| `"confirmed"` \| `"declined"` | The confirmation state. See below. |
| `source` | `"user_text"` \| `"user_choice"` | Whether the value was parsed from free text or selected from values the system offered. |

**Slots**: `manufacturer`, `model`, `variant`, `year`, `partTerm`.

**Status transitions** — this is the mechanism behind FR-102:

```
(absent) ──extracted from message──▶ stated ──lookup returns a matching row──▶ confirmed
                                       │
                                       └──lookup returns nothing──▶ (absent) + notice
(absent) ──user answers "não sei"────▶ declined
```

- **`stated`** — a hypothesis produced by the model or by a fallback parse. It MAY be used as a
  lookup argument. It MUST NOT be shown to the user as a catalog fact.
- **`confirmed`** — a catalog lookup returned a row for it. Only a confirmed value may appear in a
  reply, and it appears as the catalog spells it, not as the user typed it.
- **`declined`** — the user was asked and did not know (FR-109). Distinct from absent: a declined
  slot is never asked about again in the same conversation.

**Validation rules**

- `year` MUST be an integer within the range the catalog contains; a year outside it is treated as
  unmatched rather than as an error, per `001` FR-009.
- Replacing a slot's value resets its `status` to `stated` and leaves every other slot untouched
  (FR-104).
- Establishing a new `manufacturer` or `model` clears `variant` and `year`, because those qualify
  the vehicle that just changed. `partTerm` survives — a user switching trucks while hunting the
  same part is the common case (spec US3, scenario 3).

---

## SlotSet

The five slots plus the bookkeeping the funnel needs.

| Field | Type | Notes |
|---|---|---|
| `slots` | `Record<SlotName, Slot>` | Sparse; absent keys mean the slot is unset. |
| `questionsAsked` | integer | Counts against the budget of two (research R7). |
| `askedAttributes` | string[] | Attributes already asked about; never asked twice, even after a budget reset. |

Carried on `SessionState` (`apps/api/src/slices/conversation/infrastructure/sessionStore.ts`),
replacing the loose `currentManufacturerId` / `currentVehicleModel` / `pendingPartQuery` fields
that hold the same information today without status or provenance.

---

## CandidateSet

The vehicle applications currently consistent with every `confirmed` and `stated` slot. Produced
by `resolve_vehicle`, never constructed in the API.

| Field | Type | Notes |
|---|---|---|
| `candidates` | `VehicleCandidate[]` | Each carries `application_id`, `description`, `year_text`, `year_from`, `year_to`, and — new in this feature — `part_count`. |
| `widened` | boolean | Existing flag: the year filter was dropped to avoid an empty result. |

**Invariant**: the API never adds, removes, or edits a candidate. It filters by asking the user,
then re-queries. This is what keeps `001` FR-018 true — every candidate the user sees came from a
catalog read performed by the MCP server.

---

## Discriminator

Derived, never stored. Computed from a `CandidateSet` (research R2, R4).

| Field | Type | Notes |
|---|---|---|
| `attribute` | string | The token or `"year"`. For token attributes the name is the token itself as the catalog spells it. |
| `values` | `{ value, remainingCount }[]` | Each offerable answer and how many candidates it would leave. |
| `reduction` | integer | `candidates.length - min(remainingCount)`. The ranking key. |

**Derivation rules**

1. Tokenise every candidate description on whitespace and punctuation, accent-folded and
   case-folded for comparison, retained in original spelling for display.
2. Discard tokens present in **every** candidate — they carry no information (FR-106).
3. Discard tokens present in exactly one candidate when the set is larger than the question budget
   could resolve — offering them is a disguised candidate list, not a question.
4. Treat the year as one further attribute whose values are the distinct year ranges, with
   candidates recording no year counting as matching every value (`001` FR-009).
5. Rank by `reduction` descending; ties break toward the attribute with fewer distinct values,
   because a question with three options is easier to answer than one with nine.
6. An attribute with a single distinct value has `reduction = 0` and MUST NOT be asked (FR-106).

**Worked example** — 21 candidates matching *Cargo 2422*, from the loaded catalog:

| Attribute | Distinct values | Reduction | Asked? |
|---|---|---|---|
| variant token | `6x4`, `6x2`, `4x2`, `E`, (absent) | high | ✅ chosen |
| year | `Todos` on the four largest candidates | 1 | ❌ skipped — FR-106 |

---

## Question

What the API returns when it needs a typed answer rather than a card selection.

| Field | Type | Notes |
|---|---|---|
| `attribute` | string | Which slot the answer fills. |
| `prompt` | string | The question in Portuguese, phrased by the model, constrained to the offered values. |
| `options` | `{ value, label }[]` | Only values present among current candidates (FR-108). |
| `skippable` | boolean | Always true — FR-109 requires a non-answer to be accepted. |

A `Question` is not a `Card`. Cards are catalog facts under the grounding ledger; a question is a
request. Keeping the types apart is what lets the interface render a question as a question
(FR-111) and keeps the ledger's meaning intact.

---

## FunnelState

The state machine's position. Derived from the `SlotSet` and the `CandidateSet` on every turn —
stored only as the previous turn's outcome, so a restart cannot desynchronise it from the slots.

| State | Meaning | Exit |
|---|---|---|
| `gathering` | Slots insufficient to resolve a vehicle. | Ask for the missing slot → `awaiting_answer`. |
| `narrowing` | Vehicle candidates > 1 and an attribute discriminates. | Ask the discriminator → `awaiting_answer`. |
| `choosing` | Candidates > 1 and nothing discriminates, or budget exhausted. | Present candidates → `needs_choice`. |
| `resolved` | Exactly one application. | Search parts → `answering`. |
| `answering` | Parts retrieved (possibly none). | Compose reply → `released`. |

**Termination**: every transition into `awaiting_answer` requires `reduction > 0` (FR-106) and
increments `questionsAsked`, which is hard-bounded at two (R7). The machine therefore cannot cycle.
