# Specification Quality Checklist: Slot-Driven Conversation Funnel

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-12
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Notes

**Iteration 1 — issues found and corrected:**

1. *Implementation detail leaked into the spec.* The feature description named a state machine, a
   `needs_input` state on the web↔API contract, and an LLM as the orchestrator. All three are HOW,
   not WHAT. Rewritten as behaviour: FR-111 requires the system to distinguish a request for a
   typed answer from a request to choose, without naming the mechanism; FR-115 constrains the
   language model's role in terms of decisions rather than architecture.

2. *Success criteria were not measurable.* An earlier draft asserted the funnel would "ask better
   questions". Replaced with SC-102 (count of non-reducing questions is zero) and SC-103 (≤2
   questions for 90% of ambiguous golden queries), both countable against the golden query set.

3. *Superseded requirements were not named.* The constitution (Principle I) prohibits silent
   divergence from prior approved specs. Added an explicit **Supersedes** note stating that this
   spec refines `001` FR-010 and FR-029 and describing exactly what changes in each.

**Open dependency carried into planning — RESOLVED 2026-08-12 by Phase 0:**

- US1's end-to-end scenario ("embreagem para Cargo 2422 6x4" → parts) was recorded as blocked on
  lookup by product category, since no clutch-kit description for that vehicle contains the word
  *embreagem*. Phase 0 research (R3) found the catalog already carries the relationship — subgroup
  *Conjunto Veicular* under group *Embreagens* — and that lookup by group already exists. Only
  term-to-group matching was missing. The capability is now **in scope** for this feature, SC-101
  stands unnarrowed, and the Assumptions section has been amended accordingly.

**Result**: all checklist items pass. Spec has been planned; `plan.md`, `research.md`,
`data-model.md`, `contracts/` and `quickstart.md` exist. Ready for `/speckit-tasks` once the owner
approves the spec (it remains **Status: Draft**, the one open Constitution Check condition).
