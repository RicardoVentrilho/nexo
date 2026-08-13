# Phase 1 — Data Model

**Feature**: Authenticated Parts Finder Chat Platform
**Date**: 2026-08-10
**Source of entities**: [spec.md](./spec.md) § Key Entities. **Source of catalog facts**:
`../eaton-scraping/GRAFO.md`.

This is the **canonical, catalog-agnostic** model (FR-021). No column, table, or identifier
carries a manufacturer name. The Eaton MS Access/Jet4 layout described in `GRAFO.md` is an
*input format* consumed by `packages/catalog-import/adapters/eaton/` and does not appear here.

---

## Catalog domain (read-only at runtime)

### `catalog`

The scoping root. Every other row belongs to exactly one catalog.

| Field | Type | Notes |
|---|---|---|
| `catalog_id` | TEXT PK | Stable slug, e.g. `eaton` |
| `name` | TEXT | Display name |
| `source_format` | TEXT | Which importer produced it — provenance only, never branched on at query time |
| `imported_at` | TEXT | ISO-8601 |
| `source_checksum` | TEXT | Of the source artifact; ties a deployed image to its data (US5) |

### `part`

| Field | Type | Notes |
|---|---|---|
| `catalog_id` | TEXT | → `catalog` |
| `part_id` | TEXT | Internal surrogate, unique within catalog |
| `part_number` | TEXT | The number the user sees. **Unique per catalog, not globally** (FR-021) |
| `part_number_normalized` | TEXT | Punctuation-stripped search key (`MX-11-0601` → `MX110601`). Lookups match on this with the same normalisation applied to user input; display always uses `part_number` |
| `description` | TEXT | |
| `is_obsolete` | INTEGER | The catalog marks discontinued parts. See the open item in [data-migration.md](./data-migration.md) — what the agent does with this is not yet decided |
| `group_id` / `subgroup_id` | TEXT NULL | → `product_group`; subgroup optional (~28% populated in the Eaton source) |
| `photo_id` | TEXT NULL | → `asset`. Sparse: ~7% of parts |
| `note` | TEXT NULL | Plain text. Rich-text conversion happens at import; failure yields NULL, never a broken import |
| `is_assembly` | INTEGER | Derived at import: true when the part has components |

PK `(catalog_id, part_id)` · UNIQUE `(catalog_id, part_number)`

### `product_group`

| Field | Type | Notes |
|---|---|---|
| `catalog_id`, `group_id` | TEXT | PK |
| `parent_group_id` | TEXT NULL | Self-referencing — collapses the source's two fixed levels into a hierarchy that admits any depth |
| `description` | TEXT | |

### `manufacturer`

Vehicle makers, and third-party makers named on cross-references.

| Field | Type | Notes |
|---|---|---|
| `catalog_id`, `manufacturer_id` | TEXT | PK |
| `name` | TEXT | |
| `used_for_vehicles` | INTEGER | Valid as a vehicle make — 86 of 139 in the Eaton source |
| `used_for_cross_reference` | INTEGER | Valid as a third-party part maker — 61 of 139; 8 are both |

> The two roles are **not** the same set. Offering a cross-reference-only brand as a vehicle make
> would be a wrong answer produced by the tool itself, so `list_manufacturers` is scoped.

> The Eaton catalog leaves parts without a manufacturer of their own — every part belongs to the
> catalog's brand. That is a property of *that* catalog, recorded by its importer, not a rule of
> this model. `part` therefore has no manufacturer column; a future catalog that needs one adds
> a nullable column without reshaping anything.

### `vehicle_application`

| Field | Type | Notes |
|---|---|---|
| `catalog_id`, `application_id` | TEXT | PK |
| `manufacturer_id` | TEXT NULL | → `manufacturer`. ~99% populated in the Eaton source |
| `description` | TEXT | Free text as authored: `"Cargo 1723 / 2423"` |
| `year_from`, `year_to` | INTEGER NULL | **Parsed at import** (R6). NULL = open on that side |
| `year_text` | TEXT NULL | The original string, for display and audit |

**Matching rule** — a requested year `Y` matches when
`(year_from IS NULL OR Y >= year_from) AND (year_to IS NULL OR Y <= year_to)`.
Both NULL matches every year. This is the fail-open behaviour R6 argues for.

### `part_application`

N:N between parts and the vehicles they fit. PK `(catalog_id, part_id, application_id)`.

### `assembly_component`

A part composed of other parts. The BOM edge.

| Field | Type | Notes |
|---|---|---|
| `catalog_id` | TEXT | |
| `assembly_part_id` | TEXT | The parent |
| `component_part_id` | TEXT | The child |
| `drawing_item` | TEXT NULL | Balloon number on the drawing — the join to `drawing_item` |
| `quantity` | INTEGER | |

PK `(catalog_id, assembly_part_id, component_part_id, drawing_item)`

### `drawing` / `drawing_item`

| `drawing` | Type | Notes |
|---|---|---|
| `catalog_id`, `drawing_id` | TEXT | PK |
| `title` | TEXT NULL | |
| `asset_id` | TEXT NULL | → `asset` |

| `drawing_item` | Type | Notes |
|---|---|---|
| `catalog_id`, `drawing_id`, `item` | TEXT | PK |
| `label` | TEXT NULL | |

`part.drawing_id` (nullable) links a part to the drawing of the assembly it belongs to.

> **Import obligation.** In the Eaton source the balloon→part link is *textual*: a drawing item
> matches a component only by comparing `drawing_item` strings. That resolution is performed at
> import and materialised into `assembly_component.drawing_item`, so no query-time string
> matching is needed and the fragility stays in the importer where it is testable.

### `cross_reference`

| Field | Type | Notes |
|---|---|---|
| `catalog_id`, `cross_reference_id` | TEXT | PK |
| `part_id` | TEXT | → `part`, the catalogued equivalent |
| `foreign_manufacturer_id` | TEXT | → `manufacturer` |
| `foreign_number` | TEXT | The third-party number, as displayed |
| `foreign_number_normalized` | TEXT | Punctuation-stripped, as in `part` |

Index on `(catalog_id, foreign_number_normalized)` — the lookup path for US4. Matching on the
normalised form is what stops a punctuated number copied off an invoice from producing a false
"not found".

### `asset`

| Field | Type | Notes |
|---|---|---|
| `catalog_id`, `asset_id` | TEXT | PK |
| `kind` | TEXT | `photo` \| `drawing` |
| `path` | TEXT | Relative to the image's asset root, **already case-resolved at import** |
| `content_type` | TEXT | |

> The source mixes `.jpg` and `.JPG` against the filesystem. Case resolution happens once at
> import; nothing at runtime does case-insensitive filesystem lookups.

### Search indexes

PostgreSQL GIN indexes over `to_tsvector('simple', ...)` are rebuilt by the importer for parts
and vehicle applications. These carry the 500 ms budget.

### Indexes backing the narrowing funnel (FR-029)

- `manufacturer` is small enough (139 rows in the Eaton source) to scan; `application_count` is
  materialised at import so `list_manufacturers` needs no aggregation at query time.
- `vehicle_application (catalog_id, manufacturer_id, description)` — backs `list_vehicle_models`,
  which returns **distinct descriptions with counts** for one manufacturer.

> **Model families are deliberately not derived.** Application descriptions are hand-authored
> free text (`"Cargo 1723 / 2423"`, `"S10 DIESEL 2.8 4X2"`). Grouping them into a clean model
> taxonomy is a normalisation project with its own failure modes, and guessing at it would put an
> inferred value in front of the user — which FR-029 forbids. The funnel lists what the catalog
> literally says, deduplicated and counted. If families are wanted later they become a derived
> column in the importer, never an inference at query time.

---

## Conversation domain (in memory, never persisted — FR-017)

### `Principal`

Derived per request from the validated token. `subject`, `displayName`, `roles: ('user' |
'administrator')[]`. Never stored.

### `Session`

Keyed by session id. Holds `principal`, `context` (resolved `application_id`, current
`part_id`), and the current `Turn`. Expires with the session; lost on restart (R8).

### `Turn`

| Field | Notes |
|---|---|
| `turnId` | Also the trace id — this is what makes SC-005's five-minute reconstruction possible |
| `ledger` | `Card[]`, append-only for the life of the turn |
| `toolCalls` | Name, normalised arguments, result count, duration — the span payload (FR-024) |
| `state` | `awaiting_model` \| `awaiting_tools` \| `composing` \| `released` \| `failed` |

### `Card` — the grounding unit

| Field | Notes |
|---|---|
| `cardId` | Sequential within the turn. What the model references as `[[card:N]]` |
| `kind` | `part` \| `vehicle_candidate` \| `assembly` \| `cross_reference` |
| `payload` | The tool result, unmodified |
| `sourceToolCall` | Which call produced it |

**Invariant — the grounding rule, stated as data**: every catalog fact rendered to the user
originates in a `Card`, and every `Card` originates in a tool result. The model contributes
prose and card references, never payload. The answer validator enforces the contrapositive: a
catalog identifier in prose that resolves to no card fails the turn (R1).

---

## Validation rules carried from requirements

| Rule | From |
|---|---|
| A part number is unique within its catalog, never globally | FR-021 |
| Unparseable year text yields open bounds; it never excludes | FR-009, R6 |
| More than one matching application ⇒ candidates returned, never auto-selected | FR-010 |
| A missing photo is a normal result, never an error | Edge cases |
| Catalog store is opened read-only; no runtime write path exists | FR-019 |
| Conversation content has no persistent representation anywhere in this model | FR-017, SC-011 |

## State transitions

**Turn**: `awaiting_model` → `awaiting_tools` → (loop, max 4 rounds — R7) → `composing` →
`released`. Any stage may go to `failed`, which still emits a complete trace (US5 scenario 3).

**Session**: `anonymous` → `authenticated` → `expired`. Revocation moves an authenticated session
to `expired` at the next request (FR-007, SC-010).
