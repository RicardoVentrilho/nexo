# Phase 0 — Research: Slot-Driven Conversation Funnel

Every decision below was taken against the loaded catalog (11,597 vehicle applications, 11,725
parts, 26,182 part↔application links), not against assumption. Measurements are reproducible with
the commands in [quickstart.md](./quickstart.md).

---

## R1 — Orchestration: explicit state machine, not an agent framework

**Decision**: implement the funnel as an explicit state machine in
`apps/api/src/slices/conversation/domain/funnel.ts`, over plain data, with no new dependency.

**Rationale**:

- The problem is slot-filling over five known slots with a small transition table. That is roughly
  150 lines of pure function. A framework is a heavier abstraction than the thing it abstracts.
- **It does not solve the hard part.** The difficulty is interpreting free Portuguese into slots
  and choosing which question to ask. The first is a structured-output call the project already
  makes; the second is arithmetic over candidate rows (R4). Neither is orchestration.
- **The Grounding Gate needs a choke point.** `001` FR-014 and this spec's FR-114 require that
  every reply be composed at a single point that checks facts against the turn's lookups. Today
  that is `GroundingLedger` + `validateGrounding` inside one method. Frameworks that distribute
  control across nodes or callbacks make that invariant harder to hold and much harder to prove to
  a reviewer, which the constitution requires at review time.
- **Testability.** The existing contract suite injects a fake model through `RunTurn`'s
  constructor and runs in milliseconds. Pure transition functions preserve that. Framework graphs
  characteristically require harnesses to make deterministic.
- **Constitution, Principle II**: a new runtime dependency must state what it replaces and why
  existing dependencies are insufficient. Neither framework clears that bar here.

**Alternatives considered**:

- **LangGraph** — the closer fit of the two, since it does model stateful graphs. Rejected: its
  value is in parallel branches, cross-process checkpoint/resume, and persisted graph state. This
  feature has a linear funnel, an in-memory `Map` session store, and a constitutional prohibition
  on retaining conversation state (`001` FR-017). None of what it offers is needed.
- **LangChain** — rejected more firmly. It is an abstraction layer over LLM calls the project
  already makes directly with the official SDK, and its tool abstractions would introduce a *third*
  representation of the tool contracts, worsening the duplication the feature is meant to remove.
- **Keep model-driven tool calling, improve the prompt** — rejected: prompt changes cannot
  guarantee FR-106 (never ask a non-reducing question), because that is a property of the data the
  model does not compute. It would also leave lookup ordering non-deterministic, which is what
  produced the five undifferentiated cards in the first place.

---

## R2 — Where the discriminator is computed: the API, from rows the MCP server returned

**Decision**: `resolve_vehicle` returns candidates enriched with `part_count`; the API computes
which attribute discriminates. No new MCP tool.

**Rationale**:

- `001` FR-018 makes the MCP server the only component that may read the catalog. Discriminator
  selection reads no catalog — it partitions rows already returned. Putting it in the API is
  therefore compliant, and keeps conversation policy in the conversation slice.
- `part_count` *is* a catalog fact, so it must come from the MCP server. It is already computed
  there by the ranking subquery.
- **The catalog-agnostic boundary (`001` FR-021)** is the reason this is worth stating explicitly.
  A tempting shortcut is to teach the API that `6x4`, `6x2`, `4x2`, `E` are drivetrain variants.
  That would put manufacturer- and catalog-specific vocabulary into the platform's model, which
  FR-021 forbids. The design instead computes the discriminator structurally: tokenise each
  candidate's description, discard tokens common to all candidates, and rank the remaining tokens
  by how much each would reduce the set. For "Cargo 2422" this surfaces `6x4`, `6x2`, `4x2`, `E`
  without any of them being named in code — and for a future catalog it would surface whatever
  that catalog uses instead.

**Alternatives considered**:

- **A new `describe_candidates` MCP tool** — rejected: it would perform no catalog read the caller
  did not already have results for, and a sixth tool must earn its place (Principle II).
- **A structured `variant` column added by the importer** — rejected for this feature. It presumes
  which attribute matters and bakes source knowledge into the canonical model; the token approach
  needs no schema change. Worth revisiting only if token partitioning proves too noisy in practice.

---

## R3 — Term-to-group matching: trigram similarity over group descriptions

**Decision**: match a part term against `product_group.description` (subgroup and its parent) using
`unaccent` plus `pg_trgm` similarity, and search parts by the matched group in addition to matching
part descriptions.

**Rationale — this is the measured core of the feature's biggest surprise:**

The spec assumed category lookup was a separate, larger feature. It is not. The path already
exists; only the matching step was missing:

```
term "embreagem"  →  group  g:9  "Embreagens"
                       └── subgroup s:13 "Conjunto Veicular"
                             └── 18 parts linked to application 16049 (Cargo 2422 6x4)
```

The parts are described as *"Kit 365mm (P/ Tubo Guia)"*; none contains the word *embreagem*. The
category relationship carries the meaning, and it was already in the data.

Two naive matching strategies were tested and **both measurably fail**:

| Strategy | Result |
|---|---|
| `description ILIKE '%embreagem%'` against the group | **No match.** Portuguese pluralisation changes *embreagem* → *Embreagen**s***; the singular is not a substring of the plural. |
| `to_tsvector('portuguese', 'Embreagens') @@ plainto_tsquery('portuguese', 'embreagem')` | **False.** The stemmer yields `'embreagens'` for the plural but `'embreag'` for the singular — it does not reconcile this pair. |
| `similarity('embreagem', 'Embreagens')` (pg_trgm) | **0.615** — well above the 0.3 default threshold. |

Trigram similarity requires no vocabulary, no synonym list, and no per-language curation beyond
accent folding, which is what keeps it compatible with FR-021. `unaccent` covers the parallel
problem (*válvula* vs *VALVULA*) that the same measurement path exposes.

**Consequence for the spec**: `spec.md`'s Assumptions section states that category lookup is
delivered separately and that SC-101 may need narrowing. That assumption is **superseded** — the
capability is in scope here and SC-101 stands as written.

**Alternatives considered**:

- **Hand-maintained synonym table** (`embreagem → g:9`) — rejected: catalog- and language-specific
  data in code (FR-021), and unbounded curation cost.
- **Portuguese full-text search** — rejected on the measurement above.
- **Prefix truncation** (`left(term, len-1)`) — rejected: it happens to work for this pair and
  breaks unpredictably elsewhere; it is a coincidence, not a rule.

**Operational note**: both extensions must be created by the import pipeline. Enabling them by
hand on a running database would violate the reproducibility rule in Technology Constraints. They
were created manually on the local development database during this research; the importer change
is a task, not an assumption.

---

## R4 — Choosing the question: highest reduction of the candidate set

**Decision**: rank candidate attributes by how much the best answer would reduce the candidate set,
ask about the highest, and never ask about an attribute whose values are uniform.

**Rationale**: FR-106 and FR-107 are arithmetic, not judgement. For each candidate attribute —
description tokens, and the year range — compute the distinct values and the candidate count each
value would leave. An attribute yielding one distinct value across the set cannot reduce it and is
skipped. This is what makes the year skipped for *Cargo 2422* and asked for a model whose
candidates genuinely differ by year, with no rule naming either case.

**The measurement that drove this** (spec's Why section, reproduced here as the acceptance basis):

- 21 applications match "Cargo 2422". The four carrying the most parts (18, 12, 8, 6) all record
  year *"Todos"*. Filtering by year 2013 leaves 20 of 21 — a reduction of one.
- Catalog-wide, 5,199 of 11,597 applications carry no year, and 13,870 of 26,182 part links (53%)
  sit on those. `001` FR-009 requires treating an unknown year as matching any year, which is
  correct and which also makes the year a weak partitioner wherever it is absent.

**Alternatives considered**:

- **Fixed order manufacturer → model → year** (the `001` FR-029 shape) — rejected: measured to
  reduce 21 candidates to 20 on the motivating case.
- **Information gain (entropy)** over attribute values — rejected as premature. Max-reduction is
  simpler, produces the same choice on every case measured, and can be replaced later behind the
  same function signature if a case is found where it differs materially.

---

## R5 — Latency

**Decision**: no new budget is requested; the existing `001` budgets hold.

**Measurements**:

- Candidate ranking with the `part_count` subquery: `EXPLAIN ANALYZE` reports **4.8 ms** execution
  for the "Cargo 2422" case (48 rows scanned, index-only on `part_application`).
- Discriminator computation is in-memory over the returned candidates — 21 rows worst measured.
- Group matching runs over 24 product-group rows.

**Direction of change is favourable**: the current design permits up to four model round-trips per
turn while the model decides which tools to call. The funnel makes exactly one extraction call and
one phrasing call, with lookups deterministic in between.

---

## R6 — Slot extraction at the model boundary

**Decision**: one `response_format: { type: "json_schema" }` call at temperature 0, returning the
five slots, each optional. The result is parsed with zod before use.

**Rationale**: the constitution classifies model output as untrusted input requiring runtime
validation, not merely typing. Extracted slots are additionally **unconfirmed** in the domain sense
of FR-102: an extracted manufacturer *"Ford"* is a hypothesis until `list_manufacturers` returns a
matching row, and only the returned row may be shown to the user. This two-stage handling —
zod-valid, then catalog-confirmed — is what allows a model to parse free text without any model
output reaching the screen as a catalog fact.

**Alternatives considered**:

- **Deterministic parsing** (regex/keyword) — rejected as the primary path: it is what
  `extractPartQuery` does today, and it cannot resolve *"o mesmo caminhão, mas 6x2"*. It remains
  as the fallback when the model is unavailable, degrading to the current behaviour rather than
  failing the turn.
- **Reusing the tool-calling loop for extraction** — rejected: it reintroduces the model as
  orchestrator, which FR-115 forbids.

---

## R7 — Question budget and termination

**Decision**: two questions per vehicle resolution, then fall back to presenting candidates.

**Rationale**: the spec fixes the budget at two on user-experience grounds. The design adds the
termination guarantee: the budget is a hard bound, and every question must strictly reduce the
candidate set (FR-106), so the funnel cannot loop. Reaching the budget is a normal outcome that
routes into the existing `needs_choice` presentation, which is why that state is retained rather
than replaced by `needs_input`.
