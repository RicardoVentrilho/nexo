# Contract — MCP Catalog Tools

**Consumer**: `apps/api` (the agent loop) — the only caller. **Provider**: `apps/mcp`.
**Transport**: MCP over the internal network. Not reachable from the browser (FR-004).
**Schemas**: zod, in `packages/contracts/src/tools/`, imported by both sides so the contract has
one definition (constitution: shared contracts).

All tools are **read-only** and **catalog-agnostic** (FR-021). None takes a manufacturer-specific
argument, and `catalog_id` is an ordinary parameter defaulting to the single loaded catalog.
Every tool call is one span carrying name, normalised arguments, result count, and duration
(FR-024). Budget: **< 500 ms**.

---

## The funnel

The tools form a narrowing chain. The agent enters at whichever step the user's sentence already
answers — *"embreagem pro Cargo 1723 2015"* enters at step 3 — and drops back a step when it
cannot narrow.

```
1. list_manufacturers      marca            139 clean rows
2. list_vehicle_models     modelo           distinct models for a manufacturer
3. resolve_vehicle         modelo + ano     → application_id   ← the pivot
4. search_parts            veículo + peça   → part_id
5. get_assemblies          kits             parent kits, components, same drawing
```

Steps 1 and 2 exist because the source data splits cleanly there: **manufacturer is structured
and clean** (139 rows, canonical spellings), while **model is free text** inside the application
description. Without step 1, mapping *"MB"*, *"Merc"*, *"Mercedes"* onto the catalog's actual
spelling would be guesswork by the model — which the Grounding Gate forbids.

Supporting tools outside the funnel: `get_part`, `find_cross_reference` (US4 enters directly at
a part), `list_groups`.

---

## 1. `list_manufacturers` — marca

**Input**: `scope` (`"vehicle"` | `"cross_reference"`, **required**), `search` (string?, name
fragment), `catalog_id?`, `limit?` (default 50).

**Output**: `{ manufacturers: [{ manufacturer_id, name, application_count }] }`

**Behaviour**: exact and prefix match over a small, clean set — an unfiltered call is cheap and
legitimate. `application_count` lets the agent prefer the maker that actually has vehicles over a
near-namesake with none.

**`scope` is required, not optional.** Measured against the source: of 139 manufacturers, **86**
are valid as vehicle makes and **61** as third-party part makers, with only 8 in both sets. An
unscoped list would offer cross-reference-only brands as vehicle makes — a wrong answer generated
by the tool itself, before the model even sees it.

**Why it earns a tool**: it is the one place in the vehicle path where the catalog has canonical
values. Resolving the brand first shrinks the free-text model search by roughly two orders of
magnitude and gives the agent a grounded value to carry forward.

---

## 2. `list_vehicle_models` — modelo

**Input**: `manufacturer_id` (string, required), `search` (string?), `catalog_id?`,
`limit?` (default 25).

**Output**: `{ models: [{ description, application_count, year_span_text }] , truncated: boolean }`

**Behaviour**: returns **distinct application descriptions** for that manufacturer, each with how
many applications share it and a human-readable span of the years covered. Requiring
`manufacturer_id` is deliberate — an unscoped model list over 11.6k applications is not useful
to anyone.

**In practice a `search` term is almost always needed too.** Measured distinct descriptions per
manufacturer: Volkswagen 961, Mercedes-Benz 865, Ford 734, Volvo 351. Listing "the models Ford
has" means 734 rows. The default limit of 25 with `truncated: true` therefore fires constantly
for the large makes, and the agent must treat that as a prompt to ask for a narrowing term — not
as a list to present. A truncated list shown as if complete is the failure mode here.

**What this deliberately does not do**: it does not infer model *families*. The source
descriptions are free text authored by hand — `"Cargo 1723 / 2423"`, `"S10 DIESEL 2.8 4X2"` —
and grouping them into a clean taxonomy is a data-normalisation project with its own failure
modes. This tool returns what the catalog actually says, deduplicated and counted. If model
families are wanted later, they belong in the importer as a derived column, not in a tool that
guesses at query time.

`truncated: true` tells the agent to ask for a narrowing term rather than present a partial list
as if it were complete.

---

## 3. `resolve_vehicle` — modelo + ano — US2

The pivot. Everything before this narrows toward it; everything after depends on its output.

**Input**
| Field | Type | Notes |
|---|---|---|
| `model` | string | Free text, as the user said it |
| `manufacturer_id` | string? | From step 1 when resolved |
| `manufacturer` | string? | Free-text fallback when step 1 was skipped |
| `year` | integer? | Matched against parsed bounds |
| `catalog_id?`, `limit?` | | Default limit 10 |

**Output**: `{ candidates: VehicleCandidate[], widened: boolean }`

`VehicleCandidate`: `application_id`, `description`, `manufacturer_name?`, `year_text?`,
`year_from?`, `year_to?`.

**Behaviour**
- FTS over `application_fts`, filtered by manufacturer and by the year rule in
  [data-model.md](../data-model.md).
- If a year was given and nothing matches, retry without it and set **`widened: true`** — the
  agent must then tell the user there was no exact year match (US2 scenario 3). Returning zero
  results silently would hide compatible parts.
- More than one candidate is normal and expected. The tool **never ranks one as the answer**;
  choosing is the user's, through the agent (FR-010).

### Why model and model+year are one tool, not two

This is the one place where this contract departs from the five tools as listed by the project
owner, so the reasoning is recorded rather than assumed.

`year` is an optional filter on an otherwise identical query. Splitting it would produce two
tools whose schemas differ by one nullable field, and the agent would have to choose between
them on every turn — a choice with no right answer that it will sometimes get wrong. Worse, the
`widened` fallback only makes sense inside a single tool: "search with the year, and if that
empties the result, search without it and say so" is one operation, and splitting it would push
that retry logic into the model, where it is unenforceable.

The user-facing capability you asked for is fully present. What is merged is the plumbing.

---

## 4. `search_parts` — veículo + peça — US1

**Input**
| Field | Type | Notes |
|---|---|---|
| `query` | string | The part in the user's words |
| `application_id` | string? | Preferred — comes from step 3 |
| `vehicle_text` + `year` | string?, integer? | Fallback when no application was resolved |
| `group_id` | string? | For the "not found, browse by group" path |
| `catalog_id?`, `limit?` | | Default limit 10 |

Exactly one of `application_id` or `vehicle_text` should be supplied. Both absent is a valid
catalog-wide search; both present is a validation error.

**Output**: `{ parts: PartResult[], total: integer }`

`PartResult`: `part_id`, `part_number`, `description`, `group`, `subgroup?`, `is_assembly`,
`is_obsolete`, `has_photo`, `photo_asset_id?`.

**Behaviour**
- FTS over `part_fts`, restricted to parts linked to the application when one is given.
- **Ordering: `is_obsolete ASC, relevance DESC`** (FR-030). Discontinued parts are ranked below
  current ones, never filtered out — a discontinued part is often the only correct answer for an
  older vehicle, and withholding it would be a false "not found".
- `is_obsolete` travels on every result and every card, because ranking alone is not enough: when
  a discontinued part is the only match it still appears first. The flag is what lets the card
  mark it, which is the other half of FR-030.
- **Photo bytes are not returned** — only `photo_asset_id`. The browser fetches the image from
  the API's authenticated passthrough (R4). This diverges deliberately from the upstream spec's
  inline-image decision, which assumed a desktop MCP client rather than a web app.
- Empty results are a normal outcome, not an error (FR-015).

---

## 5. `get_assemblies` — kits — US3

**Input**: `part_id`, `catalog_id?`.

**Output**
| Field | Notes |
|---|---|
| `parent_assemblies[]` | Kits containing this part |
| `components[]` | Its components when it is itself a kit — with `quantity`, `drawing_item` |
| `same_drawing[]` | Parts sharing its exploded drawing, excluding itself |

Each entry: `part_id`, `part_number`, `description`, `is_obsolete`, `has_photo`. All three lists
apply the same `is_obsolete ASC` ordering as `search_parts` (FR-030) — a kit suggestion that
leads with a discontinued component is the same error in a different place.

**Behaviour**: all three lists may be empty; an empty result is not an error (US3 scenario 3).
The drawing-item-to-component resolution was materialised at import, so this is index lookups,
not query-time string matching (see data-model.md).

**`same_drawing` is empty for most parts, by data rather than by bug.** Only 758 of 11,725 parts
carry a drawing reference at all, and the textual balloon→component join resolves **9,676 of
76,601** assembly rows (~12.6%). Measured, not estimated — see
[data-migration.md](../data-migration.md) §8. `parent_assemblies` and `components` have far
better coverage and carry this tool. An empty `same_drawing` must never be presented as a
failure, and a test asserting it is populated would be testing a false premise.

**Naming note**: the upstream spec of 2026-08-06 called this `upsell`. This platform is a finder,
not a sales tool — the tool returns the same catalog relationships under a name that describes
what they are. "Kits" is the user-facing word; `parent_assemblies` and `components` are the two
directions of the same edge.

---

## Supporting tools

### `get_part`
**Input**: `part_id` or `part_number`, `catalog_id?`.
**Output**: the full `PartResult` plus `note?` (plain text; NULL when rich-text conversion failed
at import), `drawing_id?`, and `applications: VehicleCandidate[]` — what the part fits.

### `find_cross_reference` — US4
**Input**: `foreign_number` (string), `catalog_id?`.
**Output**: `{ matches: [{ part_id, part_number, description, foreign_manufacturer_name,
foreign_number, is_obsolete, has_photo }] }` — same ordering rule (FR-030).

**Matching is exact on the normalised form** — punctuation stripped from both the stored number
and the user's input, so `MX-11-0601` and `MX110601` both find the same part. This is not fuzzy
matching: it is the same number written two ways, and the source catalog already maintains both
forms. Without it, a number copied off an invoice produces a false "not found" indistinguishable
from a real one.

Beyond that, **no fuzzy matching** — an approximate cross-reference is a wrong part, and FR-015
requires saying nothing was found (US4 scenario 2).

### `list_groups`
**Input**: `parent_group_id?`, `application_id?`, `catalog_id?`.
**Output**: `{ groups: [{ group_id, description, part_count }] }`
Backs the "part not found, offer to browse by group" edge case.

---

## Errors

Uniform shape: `{ error: { code, message } }`. Codes: `invalid_arguments`, `not_found`,
`catalog_unavailable`, `internal`.

`catalog_unavailable` is significant — on it the agent MUST tell the user the catalog cannot be
reached and return no part data. Answering from the model's own knowledge is forbidden
(edge cases, FR-014).

---

## Contract tests

Per tool: schema round-trip; the documented empty-result path; the 500 ms budget against a built
canonical catalog; and execution against **both** the Eaton catalog and the SC-012 fixture with
no tool-side branching — the assertion FR-022 actually rests on.

Two funnel-level tests beyond the per-tool ones:

- **Drill-down path**: starting from a brand alone (*"quais modelos de Ford?"*), the chain
  1 → 2 → 3 → 4 → 5 reaches a part with every step grounded in the previous step's output.
- **Direct-entry path**: *"embreagem pro Cargo 1723 2015"* enters at step 3 without calling
  steps 1 or 2, proving the funnel is enterable at any level rather than a mandatory sequence.
