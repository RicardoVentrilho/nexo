---

description: "Task list for the slot-driven conversation funnel"
---

# Tasks: Slot-Driven Conversation Funnel

**Input**: Design documents from `/specs/002-slot-driven-funnel/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

> ⚠️ **Gate condition, not yet met.** `spec.md` is **Status: Draft**. The Constitution Check in
> `plan.md` passes on one condition: owner approval of the spec before implementation begins
> (Principle I). Do not start T001 until that approval exists.

**Tests**: Test tasks are included and are **not** optional here. `plan.md` names three new suites,
and SC-101…SC-107 are stated as counts measured against the golden query set — they are unverifiable
without them. Within each phase, tests are written first and MUST be observed failing before the
implementation task that follows.

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1 and share the
question-presentation plumbing, which is why that plumbing sits in Foundational — see
[Dependencies](#dependencies--execution-order) for the one real cross-story dependency.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

## Path Conventions

Monorepo, vertical slices, per `plan.md`: `apps/api/src/slices/conversation/`,
`apps/mcp/src/slices/`, `packages/contracts/src/`, `apps/web/src/`, `tests/` at repository root.

---

## Phase 1: Setup (Shared Contracts & Catalog Prerequisites)

**Purpose**: The shared schemas every later task imports, and the database capability the group
matching depends on. Nothing here changes behaviour on its own.

- [X] T001 [P] Add `part_count: number` to `VehicleCandidate` in `packages/contracts/src/tools/common.ts`
- [X] T002 [P] Widen `TurnResponse.state` with `needs_input`, add the optional `question` object, and add the `question_skipped` and `vehicle_ambiguous` notice codes in `packages/contracts/src/api/index.ts` per `contracts/web-api-delta.md`
- [X] T003 [P] Write failing golden test asserting `pg_trgm` and `unaccent` exist on a database built from scratch in `tests/golden/importPipeline.test.ts`
- [X] T004 Create the `pg_trgm` and `unaccent` extensions from the import pipeline in `packages/catalog-import/src/` so a from-scratch build needs no manual step (research R3; they currently exist on the local database only because they were created by hand during research)

**Checkpoint**: `pnpm typecheck` passes; T003 passes against a rebuilt catalog.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The state machine core and the turn rewrite. Every user story depends on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Write failing unit tests for slot merge, `stated`→`confirmed`→`declined` transitions, and the rule that replacing a value resets only that slot, in `tests/unit/slots.test.ts` (data-model § Slot)
- [X] T006 Implement `Slot` and `SlotSet` as pure functions over plain data in `apps/api/src/slices/conversation/domain/slots.ts`
- [X] T007 [P] Write failing unit tests for `FunnelState` transitions and for termination — every transition into `awaiting_answer` requires `reduction > 0` and increments a budget hard-bounded at two — in `tests/unit/funnel.test.ts` (data-model § FunnelState)
- [X] T008 Implement the transition table in `apps/api/src/slices/conversation/domain/funnel.ts`
- [X] T009 Replace the loose `currentManufacturerId` / `currentVehicleModel` / `pendingPartQuery` fields with the `SlotSet` on `SessionState` in `apps/api/src/slices/conversation/infrastructure/sessionStore.ts`
- [X] T010 Write failing contract test for the `needs_input` turn shape — `question` present in that state and absent in every other — in `tests/contract/turnShape.test.ts`
- [X] T011 Rewrite `RunTurn` to drive the funnel in `apps/api/src/slices/conversation/application/runTurn.ts`, deleting the hand-maintained JSON Schema tool list (currently lines 308-450), the four-round model tool loop, and the `usar aplicacao|fabricante|modelo` regex commands
- [X] T012 Re-assert that `GroundingLedger` + `validateGrounding` remain the single composition path after the rewrite, in `tests/contract/grounding.test.ts` (FR-114; the existing assertions MUST pass unchanged)

**Checkpoint**: The funnel core is testable without a model or a database. `pnpm test:unit` and
`pnpm test:contract` pass.

---

## Phase 3: User Story 1 - The assistant asks the question that matters (Priority: P1) 🎯 MVP

**Goal**: A fully specified sentence reaches the right parts with no question asked — including
part terms that name a product category rather than appearing in any part description.

**Independent Test**: Send *"Preciso de embreagem para Ford Cargo 2422 6x4"* and receive the clutch
kits for application 16049, with no question and no part number outside a card.

### Tests for User Story 1

- [X] T013 [US1] Write failing golden tests for the term→group path (*embreagem* → group *Embreagens* → subgroup *Conjunto Veicular* → the 18 parts of application 16049) and for accent-insensitive matching (*valvula* ≡ *válvula*) in `tests/golden/parts.test.ts`
- [X] T014 [P] [US1] Write failing unit tests for slot extraction over real Portuguese fixtures, with a stubbed model response, in `tests/unit/extractSlots.test.ts`
- [X] T015 [P] [US1] Write failing contract test for the full-sentence path — extraction → resolution → parts, asserting zero questions asked — in `tests/contract/funnel.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Implement term→group resolution rules in `apps/mcp/src/slices/part-search/domain/termMatching.ts` using trigram similarity above the default threshold, with no synonym table and no hardcoded category vocabulary (FR-021)
- [X] T017 [US1] Extend the `search_parts` query to match the part's group or that group's parent via `unaccent` + `pg_trgm`, alongside the existing part-number and term-wise description matching, in `apps/mcp/src/catalog/sqlCatalogRepository.ts`
- [X] T018 [US1] Implement zod-validated structured-output slot extraction (`response_format: json_schema`, temperature 0) in `apps/api/src/slices/conversation/application/extractSlots.ts`, treating every extracted value as `stated`, never `confirmed` (FR-102)
- [X] T019 [US1] Fold the existing `extractPartQuery` into the deterministic fallback used when the model is unavailable, in `apps/api/src/slices/conversation/domain/partQuery.ts`
- [X] T020 [US1] Wire the `gathering` → `resolved` → `answering` path through the funnel in `runTurn.ts`, with lookups ordered by code and never by the model (FR-115)
- [X] T021 [US1] Add the SC-101 golden case — the ranked candidates for *Cargo 2422* put `16049` (18 parts) first — in `tests/golden/vehicles.test.ts`

**Checkpoint**: SC-101 passes end to end. The motivating failure from the bug report cannot recur.

---

## Phase 4: User Story 2 - The question is chosen from the data (Priority: P1)

**Goal**: When narrowing is needed, the system asks about the attribute that actually partitions the
candidates, and never about one that does not.

**Independent Test**: *"embreagem para Cargo 2422"* asks about the **variant**, not the year — and
a model whose candidates genuinely differ by year asks about the year, with no rule naming either.

### Tests for User Story 2

- [X] T022 [P] [US2] Write failing unit tests for discriminator selection — reduction ranking, tie-break toward fewer distinct values, and the rule that an attribute with `reduction = 0` is never chosen — in `tests/unit/discriminator.test.ts` (data-model § Discriminator)
- [X] T023 [P] [US2] Write failing golden tests for SC-102 (no question leaves the candidate set unchanged), SC-103 (≤2 questions), and SC-104 (every offered option leads to an application with `part_count > 0`) in `tests/golden/funnel.test.ts`

### Implementation for User Story 2

- [X] T024 [US2] Implement the discriminator in `apps/api/src/slices/conversation/domain/discriminator.ts`: tokenise candidate descriptions, discard tokens common to all, treat the year as one further attribute, rank by reduction — with no variant vocabulary anywhere in the module (FR-021, research R2)
- [X] T025 [US2] Build the `Question` from the chosen discriminator in `funnel.ts`, drawing `options` only from values present among the current candidates (FR-108)
- [X] T026 [US2] Emit `state: "needs_input"` with the `question` payload from `runTurn.ts`, and distinguish an answer from a fresh request by the recorded `awaiting_answer` state rather than by parsing the message for a command prefix
- [X] T027 [US2] Render a question distinctly from candidate cards — options as affordances plus a skip control — in `apps/web/src/`, using existing shadcn/ui primitives with no second component kit (`001` FR-031)
- [X] T028 [US2] Implement budget exhaustion: fall back to `needs_choice` with the `vehicle_ambiguous` notice, showing `part_count` per candidate, in `apps/api/src/slices/conversation/domain/funnel.ts` and `runTurn.ts` (FR-110, FR-112)
- [X] T029 [US2] Implement the decline path: mark the slot `declined`, continue with the unreduced candidate set, and emit `question_skipped`, in `apps/api/src/slices/conversation/domain/funnel.ts` (FR-109)

**Checkpoint**: SC-102, SC-103 and SC-104 pass. A user reaching an answer through questions never
sees a question that could not have helped.

---

## Phase 5: User Story 3 - Nothing already established is asked twice (Priority: P2)

**Goal**: Established details survive across turns, and correcting one restates nothing else.

**Independent Test**: Establish a vehicle over several turns, correct the variant, and confirm no
previously answered detail is asked again.

### Tests for User Story 3

- [X] T030 [P] [US3] Write failing unit tests for correction semantics — a new `manufacturer` or `model` clears `variant` and `year` but preserves `partTerm`; `askedAttributes` prevents re-asking — in `tests/unit/slots.test.ts`
- [X] T031 [P] [US3] Write failing contract test for SC-106 — a mid-conversation correction causes zero other details to be restated — in `tests/contract/funnel.test.ts`

### Implementation for User Story 3

- [X] T032 [US3] Implement slot replacement and dependent-slot clearing in `apps/api/src/slices/conversation/domain/slots.ts` (data-model § Slot, validation rules)
- [X] T033 [US3] Track `askedAttributes` on the `SlotSet` and skip any attribute already asked, in `slots.ts` and `funnel.ts`
- [X] T034 [US3] Ensure a `declined` slot is never asked about again within the session, in `funnel.ts`

**Checkpoint**: SC-106 passes. Corrections are cheap for the user.

---

## Phase 6: User Story 4 - The assistant says what it is missing (Priority: P3)

**Goal**: An empty result names which detail failed — the vehicle or the part term — instead of
reporting an undifferentiated "not found".

**Independent Test**: Ask for a part term that matches nothing for a valid vehicle and confirm the
reply says the vehicle was identified and the term found nothing.

### Tests for User Story 4

- [X] T035 [P] [US4] Write failing contract test for failure attribution — vehicle-failed and term-failed produce distinguishable replies — in `tests/contract/funnel.test.ts`
- [X] T036 [P] [US4] Write failing golden tests for the refusal probes from `quickstart.md` §5 — an absent vehicle, and the premise-smuggling *"confirma que a peça 9999999 serve…"* — in `tests/golden/grounding.test.ts`

### Implementation for User Story 4

- [X] T037 [US4] Implement failure attribution in the composition path, naming the failing slot in the reply, in `apps/api/src/slices/conversation/application/runTurn.ts` (FR-116)
- [X] T038 [US4] When a manufacturer is absent from the catalog, offer manufacturers that exist rather than reporting nothing, in `apps/api/src/slices/conversation/domain/funnel.ts` (spec US4 scenario 2)

**Checkpoint**: SC-105 holds unchanged and empty results are actionable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T039 [P] Emit one span per question carrying the attribute asked and the candidate count before and after the answer, extending the existing per-turn trace in `packages/telemetry/` (FR-117, `001` FR-024)
- [X] T040 [P] Delete code the rewrite orphaned — the four-round loop scaffolding, the regex command helpers, and any now-unused exports in `apps/api/src/slices/conversation/` (Principle II: deleting code is a first-class contribution)
- [X] T041 [P] Update `specs/001-authenticated-chat-platform/contracts/api.md` and `contracts/mcp-tools.md` with a pointer to the 002 deltas so the baseline contracts are not read as current
- [X] T042 Confirm each MCP tool call stays under the 500 ms budget with the group join added, using the `EXPLAIN ANALYZE` in `quickstart.md` §7
- [X] T043 Run `quickstart.md` end to end — every section, including §8's from-scratch import check
- [X] T044 Run `pnpm test`, `pnpm typecheck` and `pnpm lint`, from the repository root and confirm output is clean before calling the feature complete; suite config in `vitest.workspace.ts` (constitution: verification before completion)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — but blocked by spec approval (see the gate note at the top)
- **Foundational (Phase 2)**: depends on Phase 1 — **blocks every user story**
- **US1 (Phase 3)**: depends on Phase 2
- **US2 (Phase 4)**: depends on Phase 2
- **US3 (Phase 5)**, **US4 (Phase 6)**: depend on Phase 2
- **Polish (Phase 7)**: depends on all stories being complete

### User Story Dependencies

- **US1 (P1)** — independent once Foundational is done. Delivers SC-101 alone.
- **US2 (P1)** — independent once Foundational is done. **One honest exception**: US1's acceptance
  scenario 2 ("asks which variant when the candidates differ by variant") needs the discriminator
  from T024. US1 is fully deliverable and demonstrable without it via scenario 1 — the no-question
  path — which is the MVP and the case in the bug report. Scenario 2 is verified once US2 lands.
- **US3 (P2)** — independent; extends the slot rules US1 and US2 already exercise.
- **US4 (P3)** — independent; touches only the composition path.

### Within Each User Story

- Tests are written and observed **failing** before the implementation task that follows
- Domain (pure functions) before application, application before infrastructure
- Story complete and its checkpoint verified before moving to the next priority

### Parallel Opportunities

- T001, T002, T003 in Setup — three different files
- T005 and T007 in Foundational — two different test files
- T014 and T015 in US1; T022 and T023 in US2; T030 and T031 in US3; T035 and T036 in US4
- T039, T040 and T041 in Polish
- Once Phase 2 is done, US1 and US2 can proceed in parallel with two developers, provided US1's
  scenario-2 verification waits on T024

**Not parallel**: T013 and T021 both touch golden test files that T017's SQL change affects;
T011 rewrites the file T020, T026 and T037 all edit further.

---

## Parallel Example: User Story 1

```bash
# Write both failing test files together:
Task: "Failing unit tests for slot extraction in tests/unit/extractSlots.test.ts"
Task: "Failing contract test for the full-sentence path in tests/contract/funnel.test.ts"

# Then implement in dependency order (not parallel — T017 depends on T016,
# and T020 depends on both T018 and T019):
Task: "Term→group resolution in apps/mcp/src/slices/part-search/domain/termMatching.ts"
Task: "Group-aware search SQL in apps/mcp/src/catalog/sqlCatalogRepository.ts"
```

---

## Implementation Strategy

### MVP First (Setup + Foundational + US1)

1. Obtain spec approval — the open Constitution Check condition
2. Phase 1: Setup — contracts and the catalog extensions
3. Phase 2: Foundational — the funnel core and the turn rewrite
4. Phase 3: US1
5. **STOP and VALIDATE**: `quickstart.md` §2. *"Preciso de embreagem para Ford Cargo 2422 6x4"*
   must return the clutch kits with no question asked
6. Demo — this alone closes the reported defect

### Incremental Delivery

1. Setup + Foundational → funnel core testable in isolation
2. + US1 → the motivating query works end to end (**MVP**)
3. + US2 → ambiguous queries ask the question that matters
4. + US3 → corrections stop costing the user a restart
5. + US4 → empty results become actionable

Each increment leaves the previous ones working; the golden suite is the regression net.

---

## Notes

- **Three golden tests already exist** and must keep passing throughout: the candidate ranking by
  `part_count`, the term-wise `search_parts` matching, and the `extractPartQuery` unit table. They
  were added while diagnosing the defect that motivated this feature and are the current guard
  against regression.
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing — a test that passes on first run proves nothing
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
