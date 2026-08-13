# Implementation Plan: Slot-Driven Conversation Funnel

**Branch**: `master` (no feature branch — no `before_specify` git hook is installed) | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-slot-driven-funnel/spec.md`

## Summary

Replace model-driven orchestration of the catalog funnel with an explicit slot-filling state
machine, and choose each clarifying question from the candidate set rather than from a fixed
attribute order.

Three structural decisions carry the feature:

1. **The model stops deciding.** Today `RunTurn` hands the model a tool list and lets it choose
   which lookups to run, in what order, over four rounds. After this feature the model does two
   narrow jobs — parse a message into slots, and phrase the final reply — and code decides every
   lookup. This satisfies FR-115 and, as a side effect, retires the hand-maintained JSON Schema
   tool list in `runTurn.ts` that currently duplicates the zod tool contracts.

2. **The question is derived, not configured.** After each `resolve_vehicle` call the API holds
   the candidate applications. It computes which description tokens partition that set and how
   many candidates each value would leave, then asks about the token with the highest reduction.
   No list of known variants exists anywhere in the code — the discriminator is a property of the
   returned rows, which is what keeps FR-105 compatible with the catalog-agnostic rule (`001`
   FR-021).

3. **Part terms resolve through product groups, not only descriptions.** Phase 0 confirmed the
   dependency the spec flagged as out of scope is far smaller than feared: the clutch kits for
   *Cargo 2422 6x4* sit in subgroup *Conjunto Veicular*, whose parent group is *Embreagens*. The
   capability to search by group already exists. What was missing is term-to-group matching, and
   the measurement in R3 shows why the obvious approach fails. This folds into the feature and
   SC-101 is deliverable in full — the spec's Assumptions section is superseded on this point.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 22 LTS. Unchanged from `001`.

**Primary Dependencies**: No new runtime dependency. The feature is built from what is already
present — `openai` (structured output via `response_format: json_schema`), `zod` (slot validation
at the model boundary), `pg`, `@modelcontextprotocol/sdk`. LangGraph and LangChain were evaluated
and rejected; see research R1.

**Storage**: Two PostgreSQL extensions become required on the catalog database — `pg_trgm` and
`unaccent` — for term-to-group matching (R3). They MUST be created by the import pipeline, not by
hand. Conversation state remains in-memory and session-scoped (`001` FR-017): no new storage.

**Testing**: Vitest. This feature adds three suites — slot extraction (unit, real fixtures, no
model call), discriminator selection (unit, table-driven over candidate sets), and funnel
traversal (contract, fake model injected as `RunTurn` already permits). The golden query set gains
the cases behind SC-101 through SC-104.

**Target Platform**: Unchanged — Azure Container Apps, identical images under Docker Compose.

**Project Type**: Monorepo, vertical slices. This feature touches the `conversation` slice in
`apps/api`, the `part-search` and `vehicle-resolution` slices in `apps/mcp`, `packages/contracts`,
and the chat surface in `apps/web`.

**Performance Goals**: Unchanged budgets — each MCP tool call under 500 ms, first substantive
answer within 5 s (`001` SC-002). The funnel changes the shape of the budget favourably: the
current design spends up to four model round-trips deciding tool calls; the new one spends one
extraction call plus deterministic lookups plus one phrasing call. The ranking subquery added by
the recent fix measures 4.8 ms (R5).

**Constraints**: The model's output is untrusted input and MUST be validated at runtime
(constitution, Boundaries). Extracted slots are hypotheses until a lookup confirms them (FR-102).
One composition point for grounding (FR-114). No catalog read outside `apps/mcp` (`001` FR-018).

**Scale/Scope**: 11,597 vehicle applications, 11,725 parts, 26,182 part↔application links, 24
product groups over two levels. Candidate sets reaching the discriminator are small — 21 for the
worst measured case — so discriminator computation is in-memory over tens of rows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|------|--------|----------|
| **I. Spec-Driven Delivery** | ⚠️ Conditional | `spec.md` exists and passes its quality checklist but is **Status: Draft**. Owner approval is required before implementation begins. The plan also names what it supersedes: `001` FR-010 and FR-029 (refined, in spec.md), and the spec's own "category lookup is a dependency" assumption (superseded by R3 — it is in scope). |
| **II. Simplicity & YAGNI** | ✅ Pass | No new application service (stays at five). No new runtime dependency — LangChain/LangGraph explicitly rejected in R1 with the simpler alternative named. Two Postgres extensions are added; recorded in Complexity Tracking. The feature deletes more than it adds: the JSON Schema tool list and the four-round model loop in `runTurn.ts` both go. |
| **III. Observability** | ✅ Pass | FR-117 requires each question to be a recorded event carrying the attribute asked and candidate counts before/after. This extends the existing per-turn trace (`001` FR-023/FR-024) rather than creating a channel. |
| **Grounding Gate** | ✅ Pass | FR-114 keeps a single composition point. The design strengthens the gate: with the model no longer choosing lookups, the set of facts available to prose is fixed by code before the model is called to phrase anything. |
| **Shared contracts, single definition** | ✅ Pass — and repairs an existing breach | `runTurn.ts:308-450` currently hand-maintains a JSON Schema copy of the zod tool contracts in `packages/contracts/src/tools/`. That is a live violation of the Technology Constraints rule. FR-115 removes the model's tool-calling role, which deletes the duplicate outright. |
| **Catalog-agnostic (`001` FR-021)** | ✅ Pass | The discriminator is computed from returned rows; no variant vocabulary (`6x4`, `4x2`, `E`) appears in code or configuration. Term-to-group matching uses language-level normalisation, not manufacturer knowledge. See R2 for the boundary argument. |
| **MCP is the only catalog path** | ✅ Pass | Discriminator selection consumes rows already returned by `resolve_vehicle`; it performs no catalog read. `part_count` is supplied by the MCP server. |
| **Performance budget** | ✅ Pass | R5 measures the ranking query at 4.8 ms and group matching over 24 rows. Round-trip count to the model drops. |

**Result**: gate passes with one condition — spec approval before implementation. No violation
requires justification beyond the Complexity Tracking entry below.

### Post-design re-check (after Phase 1)

Re-evaluated against the artifacts actually produced. Three points needed a second look:

- **Does the new `question` field weaken the Grounding Gate?** No. A `Question` is deliberately not
  a `Card` (data-model, contracts §2), so the ledger keeps one meaning. The one place catalog data
  enters a question is `options[].value`, and the contract binds those to values drawn from
  candidate rows returned by a lookup **in that same turn** (FR-108) — the same rule cards obey.
- **Does token-based discrimination smuggle catalog knowledge into the platform?** No. Verified
  against the artifacts: no variant vocabulary appears in `data-model.md`'s derivation rules, which
  are stated purely as set operations over returned descriptions. The worked example names `6x4`
  only as an illustration of output, never as an input.
- **Did Phase 0 change scope?** Yes, and it was handled per Principle I rather than silently: R3
  found the category-lookup dependency to be far smaller than the spec assumed, so `spec.md`'s
  Assumptions section was **amended** — with the change marked and dated — before this plan relied
  on it. `checklists/requirements.md` records the resolution.

No new violation. The Complexity Tracking table below remains the single entry.

## Project Structure

### Documentation (this feature)

```text
specs/002-slot-driven-funnel/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output — conversation state, not catalog schema
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── web-api-delta.md # Phase 1 output — changes to the 001 web↔API contract
│   └── mcp-tools-delta.md # Phase 1 output — changes to the 001 MCP tool contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/api/src/slices/conversation/
├── domain/
│   ├── ledger.ts                 # exists — unchanged, still the single grounding point
│   ├── partQuery.ts              # exists — term extraction, absorbed into slot extraction
│   ├── slots.ts                  # NEW — slot set, merge, confirmation status
│   ├── discriminator.ts          # NEW — which attribute partitions a candidate set
│   └── funnel.ts                 # NEW — state transitions: what to look up, what to ask
├── application/
│   ├── runTurn.ts                # REWRITTEN — drives the funnel; no model tool loop
│   ├── extractSlots.ts           # NEW — model boundary, zod-validated structured output
│   └── validateGrounding.ts      # exists — unchanged
└── infrastructure/
    ├── mcpClient.ts              # exists — unchanged
    ├── sessionStore.ts           # MODIFIED — SessionState carries the slot set
    └── routes.ts                 # exists — unchanged

apps/mcp/src/
├── slices/part-search/
│   ├── domain/termMatching.ts    # NEW — term→group resolution rules
│   └── application/searchParts.ts# MODIFIED — group-aware search
├── slices/vehicle-resolution/    # unchanged application layer
└── catalog/sqlCatalogRepository.ts # MODIFIED — group join, part_count already added

packages/contracts/src/
├── api/index.ts                  # MODIFIED — needs_input state, Question payload
└── tools/                        # MODIFIED — resolve_vehicle output gains part_count

apps/web/src/                     # MODIFIED — render a question distinctly from candidate cards
packages/catalog-import/          # MODIFIED — create pg_trgm and unaccent extensions

tests/
├── unit/slots.test.ts            # NEW
├── unit/discriminator.test.ts    # NEW
├── contract/funnel.test.ts       # NEW
└── golden/                       # EXTENDED — SC-101…SC-104 cases
```

**Structure Decision**: The feature stays inside the existing vertical slices. All new
conversation logic lands in `apps/api/src/slices/conversation/domain/` as pure functions over
plain data, which is what makes the discriminator and the funnel testable without a model or a
database — the two slowest and least deterministic dependencies in the system.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Two PostgreSQL extensions (`pg_trgm`, `unaccent`) added to the catalog database | Term-to-group matching must survive Portuguese plural and accent variation. Measured: the term *embreagem* does not substring-match the group *Embreagens*, and Postgres' own `portuguese` stemmer does not reconcile them either — `to_tsvector('portuguese','Embreagens')` yields `'embreagens'` while the singular yields `'embreag'`, so `plainto_tsquery` returns false (R3). | **Plain `ILIKE`** rejected: measured to fail on exactly the case the feature exists to fix. **`to_tsvector('portuguese', …)`** rejected: measured false above. **A hand-maintained synonym table** rejected: it is manufacturer- and language-specific data living in code, which `001` FR-021 forbids, and it must be curated forever. Trigram similarity is a general string property requiring no vocabulary; measured `similarity('embreagem','Embreagens') = 0.615`, comfortably above the 0.3 default threshold. Operational cost is bounded: both are standard contrib extensions, already available in the `postgres:17-alpine` image, applied over 24 group rows. |

Nothing else in the design departs from the simplest viable approach. In particular the funnel is
an ordinary state machine over plain data with no framework, and it removes more code than it
adds.
