# Feature Specification: Slot-Driven Conversation Funnel

**Feature Branch**: `002-slot-driven-funnel`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Funil de conversa dirigido por slots para o chat de catálogo: substituir a orquestração livre pelo LLM por uma máquina de estados explícita que preenche marca, modelo, variante, ano e termo de peça; pergunta ao usuário apenas o atributo que realmente separa os candidatos (medido no dado, não em ordem fixa); mantém o Grounding Gate em ponto único; adiciona estado needs_input ao contrato web↔API."

## Why This Feature Exists

Feature `001` established that the assistant must ask rather than guess when a vehicle description
matches more than one catalog application (FR-010), and that a user may narrow progressively
through manufacturer, then model, then year (FR-029). Both requirements are met today by showing
the user a list of candidate cards and asking them to pick one.

Live use exposed two defects in that design, both confirmed against the loaded catalog:

1. **The card list is not an answer to a question.** A staff member asking for a clutch for a
   *Ford Cargo 2422 6x4* was shown five cards all labelled "CARGO 2422", differing only by year
   range. Nothing in the exchange told them which distinction mattered, and the variant they had
   already typed — *6x4* — was absent from every card. The application they picked carried one
   part, a brake hose.
2. **The fixed manufacturer → model → year order does not match the data.** Of the 21 catalog
   applications matching "Cargo 2422", the four carrying the most parts (18, 12, 8 and 6) all
   record their year as *"Todos"* — every year. Asking the year narrows 21 candidates to 20.
   Catalog-wide, 5,199 of 11,597 applications carry no year at all, and 13,870 of the 26,182
   part-to-application links — **53%** — sit on those year-less applications. For this catalog
   the discriminating attribute is usually the variant suffix carried in the application's own
   description (*6x4*, *6x2*, *4x2*, *E*), not the year.

This feature replaces "show the candidates and let the user pick" with "ask the one question whose
answer actually separates the candidates, chosen by inspecting the candidates themselves".

**Supersedes**: this specification refines — it does not revoke — `001` FR-010 and FR-029.
FR-010's prohibition on choosing for the user stands; what changes is that the system must first
ask a discriminating question rather than present an undifferentiated list. FR-029's progressive
narrowing stands as a capability; what changes is that its step order is derived from the
candidate set rather than fixed at manufacturer → model → year.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The assistant asks the question that matters (Priority: P1)

A staff member types everything they know in one sentence — *"preciso de embreagem para Ford Cargo
2422 6x4"*. The system understands each detail as a separate piece of information: the
manufacturer, the model, the variant, and the part wanted. It confirms each against the catalog,
finds that the vehicle is now identified, and answers. When something is genuinely missing, it asks
for that one thing in a sentence — not by presenting a wall of near-identical options.

**Why this priority**: This is the failure the feature exists to fix. Without it, the assistant
discards details the user already supplied and asks them to disambiguate something they cannot
see the basis for. Every other story in this feature is a refinement of this behaviour.

**Independent Test**: Send a single fully-specified sentence and confirm the assistant reaches a
part answer without asking anything. Send the same sentence with the variant removed and confirm
the assistant asks exactly one question, about the variant.

**Acceptance Scenarios**:

1. **Given** a message naming manufacturer, model, variant and part in one sentence, **When** the
   catalog holds exactly one matching vehicle application, **Then** the system answers with parts
   for that application without asking anything.
2. **Given** a message naming manufacturer, model and part but no variant, **When** the matching
   applications differ by variant, **Then** the system asks which variant, offering only variant
   values that exist among those candidates.
3. **Given** a message naming a detail the user already supplied, **When** the system asks a
   follow-up question, **Then** that question is never about a detail already supplied.

---

### User Story 2 - The question is chosen from the data, not a fixed order (Priority: P1)

Two different vehicles need two different questions. For a model whose candidates differ by
drivetrain variant, the assistant asks about the variant. For a model whose candidates differ by
year range, it asks about the year. The assistant never asks for a detail that would not reduce the
candidate set, and never withholds a question that would.

**Why this priority**: Equal to Story 1 because the fixed order is the second half of the same
defect. A slot-filling funnel with a hardcoded manufacturer → model → year sequence reproduces the
original problem on this catalog, where the year is the weakest of the available attributes.

**Independent Test**: Take one model whose candidates vary by variant and one whose candidates vary
by year. Confirm each produces a different question, and that neither question is asked when the
attribute is uniform across candidates.

**Acceptance Scenarios**:

1. **Given** candidate applications that all record the same year coverage, **When** the system
   needs to narrow further, **Then** it MUST NOT ask for the year.
2. **Given** candidate applications distinguished only by year range, **When** the system needs to
   narrow further, **Then** it asks for the year.
3. **Given** candidate applications where more than one attribute discriminates, **When** the
   system needs to narrow further, **Then** it asks about the attribute that eliminates the most
   candidates.

---

### User Story 3 - Nothing already established is asked twice (Priority: P2)

Across a conversation, the assistant remembers the manufacturer, model, variant, year and part term
already established, and asks only for what is still missing. When the user corrects one of them —
*"na verdade é 6x2"* — the correction replaces that detail alone and everything else established
stays put.

**Why this priority**: Valuable but not the core defect. The system already preserves some context
within a session (`001` FR-016); this story makes that context explicit per attribute so a
correction does not restart the funnel.

**Independent Test**: Establish a vehicle over several turns, then correct one attribute, and
confirm the assistant re-asks nothing that was previously answered.

**Acceptance Scenarios**:

1. **Given** a manufacturer and model established in earlier turns, **When** the user names only a
   part, **Then** the system does not ask for the manufacturer or model again.
2. **Given** an established variant, **When** the user states a different variant, **Then** the new
   value replaces the old one and no other established detail is discarded.
3. **Given** an established vehicle, **When** the user asks about a different part, **Then** the
   vehicle is retained and only the part term changes.

---

### User Story 4 - The assistant says what it is missing (Priority: P3)

When the catalog cannot answer — the part term matches nothing for the identified vehicle, or the
named vehicle does not exist — the assistant says exactly that, and says which detail would let it
continue. It never fills the gap with a plausible-looking part.

**Why this priority**: `001` FR-014 and FR-015 already forbid guessing and require stating an empty
result. This story extends that to the funnel: an empty result should also report which slot failed,
so the user knows whether to correct the vehicle or the part term.

**Independent Test**: Ask for a part term that exists nowhere in the catalog for a valid vehicle,
and confirm the reply names the part term as the failing detail rather than reporting a generic
"not found".

**Acceptance Scenarios**:

1. **Given** an identified vehicle, **When** no part matches the part term, **Then** the reply says
   the vehicle was identified and the part term found nothing.
2. **Given** a manufacturer name absent from the catalog, **When** the user submits it, **Then**
   the reply says that manufacturer is not in the catalog and offers manufacturers that are.
3. **Given** any failure to answer, **When** the reply is composed, **Then** it contains no part
   number that did not come from a catalog lookup in that conversation.

---

### Edge Cases

- **No attribute discriminates.** Several candidate applications are identical in every attribute
  the user could be asked about and differ only in internal identity. The system MUST fall back to
  presenting them for selection rather than asking an unanswerable question, and MUST show what
  distinguishes them in practice — how many parts each carries.
- **The user cannot answer the question.** A reply of *"não sei"* MUST be accepted: the system
  proceeds with all remaining candidates rather than blocking, and says the result covers more than
  one vehicle version.
- **The user answers with a value that was not offered.** The reply is treated as a new statement
  of that attribute and re-validated against the catalog; if it matches nothing, the system says so
  and re-offers the values that exist.
- **The user contradicts an established detail mid-funnel.** The most recent statement wins, and
  the system states which detail it changed.
- **The user changes subject entirely.** Establishing a new vehicle discards vehicle attributes but
  retains nothing that would silently mix two vehicles in one answer.
- **A detail is stated that the catalog records inconsistently.** A variant the user names as *6x4*
  may appear in the catalog with other spacing or casing; matching MUST tolerate that without the
  user having to guess the catalog's spelling.
- **The part term names a category rather than a description.** A term like *embreagem* may not
  appear in any part description while naming a real product category; the system MUST still find
  those parts. (See Assumptions — this depends on category-based lookup being available.)
- **Questions do not terminate.** If the candidate set has not resolved after the question budget
  is exhausted, the system stops asking and presents the remaining candidates.

## Requirements *(mandatory)*

### Functional Requirements

**Understanding the request**

- **FR-101**: System MUST interpret a user message as a set of separately-held details —
  manufacturer, vehicle model, vehicle variant, year, and part term — rather than as a single
  opaque search string.
- **FR-102**: System MUST treat every detail interpreted from a user message as unconfirmed until a
  catalog lookup confirms it. An interpreted manufacturer or model that no catalog lookup confirms
  MUST NOT be presented to the user as a catalog fact.
- **FR-103**: System MUST carry established details across turns within a session, and MUST NOT ask
  for a detail that is already established.
- **FR-104**: System MUST allow any established detail to be replaced by a later user statement,
  replacing only that detail.

**Choosing what to ask**

- **FR-105**: System MUST decide what to ask by examining the current candidate vehicle
  applications, and MUST NOT follow a fixed attribute order.
- **FR-106**: System MUST NOT ask for an attribute whose value is uniform across the current
  candidates, or whose answer could not reduce the candidate set.
- **FR-107**: When more than one attribute would reduce the candidate set, System MUST ask about
  the one that reduces it most.
- **FR-108**: System MUST offer, with each question, only values present among the current
  candidates, and MUST NOT offer a value it inferred.
- **FR-109**: System MUST accept a non-answer and continue with the unreduced candidate set,
  stating that the result spans more than one vehicle version.
- **FR-110**: System MUST stop asking after the question budget is reached and present the
  remaining candidates for selection.

**Presenting the exchange**

- **FR-111**: System MUST distinguish, in what it returns to the interface, a request for a typed
  answer from a request to choose among candidates, so the interface can present a question as a
  question.
- **FR-112**: When candidates are presented for selection, System MUST show for each one what
  distinguishes it from the others, including how many parts it carries.
- **FR-113**: System MUST rank candidate vehicle applications so that those carrying more parts
  appear before those carrying fewer.

**Grounding and provenance**

- **FR-114**: System MUST compose every reply — question, candidate list, or answer — through a
  single point that verifies each catalog fact against the lookups performed in that turn. This
  preserves `001` FR-014 unchanged; the funnel MUST NOT introduce a second composition path.
- **FR-115**: System MUST NOT let the language model decide which catalog lookups to perform or in
  what order. The model's role is limited to interpreting the user's message into details and
  phrasing the final reply.
- **FR-116**: When the system cannot answer, System MUST name which detail failed — the vehicle or
  the part term — rather than reporting an undifferentiated empty result.
- **FR-117**: System MUST record each question it asks, the attribute it was about, and the
  candidate count before and after the answer, as part of the existing per-turn traceability
  required by `001` FR-023 and FR-024.

### Key Entities

- **Detail (slot)**: one named piece of the request — manufacturer, model, variant, year, part
  term. Holds a value, whether that value has been confirmed against the catalog, and how it was
  obtained (stated by the user, or chosen from offered values).
- **Candidate set**: the vehicle applications currently consistent with all established details.
  Shrinks as details are established; drives every decision about what to ask next.
- **Discriminating attribute**: an attribute whose values differ across the current candidate set,
  together with how many candidates each value would leave. An attribute with one distinct value
  across the set does not discriminate and is never asked about.
- **Question**: a request for one detail, carrying the attribute asked about and the values
  available among the current candidates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101**: For the request *"embreagem para Ford Cargo 2422 6x4"*, the system reaches the
  vehicle application carrying the most parts for that variant without asking any question, where
  today it presents five undifferentiated candidates and reaches an application carrying one part.
- **SC-102**: Every question the system asks reduces the candidate set. Across the golden query
  set, the count of questions that leave the candidate set unchanged is **zero**.
- **SC-103**: For at least 90% of golden queries that begin ambiguous, the user reaches a part
  answer after at most **two** questions.
- **SC-104**: When the system asks a question, at least one offered value leads to a vehicle
  application carrying at least one part — the user is never asked to choose among dead ends.
- **SC-105**: No reply contains a catalog fact absent from that turn's lookups, measured across the
  full golden query set — unchanged from `001` SC, and MUST NOT regress.
- **SC-106**: A user correcting one detail mid-conversation is asked to restate **no** other
  detail.
- **SC-107**: The added interpretation step does not push a turn's total response time beyond the
  budget already set for a turn in `001`.

## Assumptions

- **Question budget is two.** Two questions is the point past which staff at a counter are faster
  looking the part up themselves. Reaching the budget is not a failure — the system falls back to
  presenting candidates.
- **A non-answer is a valid answer.** Staff often will not know the drivetrain variant of a truck
  described over the phone. The funnel is designed to degrade to a broader result rather than
  block.
- **Variant is a first-class detail for this catalog.** It is treated as its own slot because the
  measurement above shows it discriminates where the year does not. It is expressed as free text
  inside the application description, so it is discovered from the candidate set rather than from a
  structured field. Nothing in this design assumes that remains true for a future catalog — which
  attribute discriminates MUST stay a property of the data, per `001` FR-021.
- **Category lookup is in scope.** ~~This specification assumes that capability is delivered
  separately.~~ **Amended 2026-08-12 after Phase 0 research** (constitution, Principle I: when
  investigation reveals the spec is wrong, the spec is amended first). The edge case where a part
  term names a product category absent from every part description is real — the clutch kits for
  *Cargo 2422 6x4* are described as *"Kit 365mm (P/ Tubo Guia)"* and none contains the word
  *embreagem*. But the catalog already carries the relationship: that subgroup, *Conjunto
  Veicular*, sits under the group *Embreagens*, and lookup by group already exists. Only
  term-to-group matching was missing, which is a small change rather than a separate feature.
  US1's end-to-end scenario and SC-101 therefore stand as written, with no dependency deferred.
  See [research R3](./research.md) for the measurements and the two matching strategies that fail.
- **Conversation state remains session-scoped and unretained**, per `001` FR-017. Established
  details live only as long as the session.
- **The existing catalog lookup surface is sufficient.** This feature changes how lookups are
  sequenced and how questions are chosen, not what the catalog can be asked. No new catalog
  capability is assumed beyond the category lookup noted above.
