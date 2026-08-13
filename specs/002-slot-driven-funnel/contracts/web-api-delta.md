# Contract Delta — Web ↔ Internal API

**Amends**: [`001/contracts/api.md`](../../001-authenticated-chat-platform/contracts/api.md).
Everything not listed here is unchanged, including auth, tracing, the telemetry boundary, the
one-in-flight-turn rule, and the asset and session routes.

**Schemas**: `packages/contracts/src/api/index.ts` — one definition, imported by both sides.

---

## 1. `TurnResponse.state` gains `needs_input`

```diff
- state: "released" | "needs_choice"
+ state: "released" | "needs_choice" | "needs_input"
```

| State | Meaning | What the client renders |
|---|---|---|
| `released` | The turn is complete. | Prose and cards. |
| `needs_choice` | The user must pick one of the candidate cards. **Unchanged from `001`.** | Selectable candidate cards. |
| `needs_input` | The system asked a question and is waiting for an answer. **New.** | The question, its options as affordances, and a skip control. |

`needs_choice` is retained deliberately. It remains the correct state when nothing discriminates or
when the question budget is exhausted (data-model, `FunnelState.choosing`). The two states are not
alternatives to each other — they are different requests.

**Compatibility**: this is a widening of an enum the client switches on. A client that does not
know `needs_input` MUST fall back to rendering `prose`, which always contains the question in
natural language. The question is therefore never invisible, only less well presented.

---

## 2. `TurnResponse` gains an optional `question`

```
question?: {
  attribute: string,                        // which detail the answer supplies
  options: { value: string, label: string }[],  // only values present among current candidates
  skippable: boolean                        // always true
}
```

Present if and only if `state === "needs_input"`.

**A `Question` is not a `Card`.** Cards are catalog facts recorded in the grounding ledger and
referenced from prose as `[[card:N]]`. A question is a request for information and carries no
catalog fact beyond the option values, which are themselves drawn from candidate rows returned by a
catalog lookup in that turn (FR-108). Keeping them separate preserves the ledger's single meaning
and satisfies FR-111.

**`options` may be empty** when the answer is genuinely open text — for example when the missing
slot is the part term and no candidate set exists yet. The client renders a free-text prompt.

---

## 3. `VehicleCandidate` payload gains `part_count`

```diff
  { application_id, description, year_text, year_from, year_to
+ , part_count: number }
```

Sourced from the MCP server (see [`mcp-tools-delta.md`](./mcp-tools-delta.md)); the API does not
compute it. It serves two requirements: FR-112, which obliges a candidate list to show what
distinguishes each entry, and FR-113, which orders candidates by it.

---

## 4. `Notice.code` gains two values

```diff
  code: "year_widened" | "no_results" | "catalog_unavailable" | "truncated"
-      | "grounding_violation" | "unauthenticated"
+      | "grounding_violation" | "unauthenticated"
+      | "question_skipped" | "vehicle_ambiguous"
```

- **`question_skipped`** — the user declined to answer and the result covers more than one vehicle
  version (FR-109). The client MUST surface this; a result silently spanning several vehicles is
  the failure mode `001` FR-010 exists to prevent.
- **`vehicle_ambiguous`** — the question budget was exhausted with candidates remaining, so the
  turn fell back to `needs_choice` (FR-110).

---

## 5. Answering a question

An answer is sent as the **next turn's `message`**, exactly as a card choice is today. No new route
and no new request field.

The API distinguishes an answer from a fresh request by the `awaiting_answer` state it recorded for
the session, not by parsing the message for a command prefix. This replaces the current
`usar aplicacao <id>` / `usar fabricante <id>` / `usar modelo <id> <text>` regex commands in
`runTurn.ts`, which leak an internal protocol into user-visible text and break the moment a user
types that phrase for any other reason.

**Client behaviour**: selecting an offered option sends its `value` as the message. Skipping sends
a message the API treats as a decline. Typing something else is a normal message and is re-parsed
into slots — FR-108's edge case, where the user answers with a value that was not offered.

---

## Contract tests

Added to the existing turn-shape suite:

- `needs_input` round-trips with a `question`, and `question` is absent in every other state.
- A client that ignores `state` still receives the question in `prose`.
- `part_count` is present on every `vehicle_candidate` card and is never computed API-side —
  asserted by a fake MCP client returning a known value and checking it reaches the card unchanged.
- Answering with an offered value advances the funnel; answering with an unoffered value is
  re-parsed rather than rejected.
- Skipping produces `question_skipped` and a result set spanning the unreduced candidates.
- No route accepts an unauthenticated request — unchanged from `001`, re-asserted because the turn
  handler is being rewritten.
