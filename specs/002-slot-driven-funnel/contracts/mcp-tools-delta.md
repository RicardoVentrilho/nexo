# Contract Delta — MCP Catalog Tools

**Amends**: [`001/contracts/mcp-tools.md`](../../001-authenticated-chat-platform/contracts/mcp-tools.md).
No tool is added or removed; the surface stays at eight. All tools remain read-only,
catalog-agnostic, and unreachable from the browser (`001` FR-004, FR-018, FR-021).

**Schemas**: `packages/contracts/src/tools/` — zod, imported by both sides.

---

## 1. `resolve_vehicle` — output gains `part_count`

```diff
  candidates: [{ application_id, description, year_text, year_from, year_to
+               , part_count }]
  widened: boolean
```

`part_count` is the number of parts linked to the application. It is a catalog fact and must
originate here, because the API may not read the catalog.

**Ordering becomes part of the contract**, where `001` left it unstated:

```
ORDER BY part_count DESC, description
```

An application carrying no parts cannot answer any question about parts, so alphabetical
truncation under a `LIMIT` was silently discarding the useful rows. Measured on the loaded catalog:
of 21 applications matching *Cargo 2422*, the alphabetically-first five carry 1, 1, 1, 1 and 1
parts, while the application matching the user's stated variant carries 18 and fell outside the
limit entirely.

**Status**: already implemented and covered by a golden test
(`tests/golden/vehicles.test.ts` — *"offers the applications that actually carry parts"*).
Measured at 4.8 ms; the 500 ms budget is unaffected.

---

## 2. `search_parts` — matching becomes term-wise and group-aware

### 2a. Each query term matches independently

```diff
- description ILIKE '%<entire query>%'
+ description ILIKE ALL(<one pattern per term>)
```

A description matches when it contains **all** terms, in any order. The previous single-pattern
behaviour meant any multi-word query returned nothing: `"kit tubo guia"` did not match
`"Kit 365mm (P/ Tubo Guia)"`.

Part-number matching is unchanged and still uses the whole query, since a part number is one token.

**Status**: already implemented and covered by a golden test
(`tests/golden/parts.test.ts` — *"matches every query term separately"*).

### 2b. A term may match the part's product group

```diff
  WHERE  part_number matches
      OR description matches all terms
+     OR the part's group — or that group's parent — matches the term
```

**Why**: the meaning of a category is carried by the group hierarchy, not repeated in every part
description. Measured: the clutch kits for *Cargo 2422 6x4* are described as *"Kit 365mm (P/ Tubo
Guia)"* and sit in subgroup *Conjunto Veicular*, whose parent group is *Embreagens*. The term
*embreagem* appears in none of the 18 part descriptions. Without group matching, the single most
common query in this domain returns nothing.

**Matching rule** — `unaccent` + `pg_trgm` similarity above the default threshold, **not**
substring and **not** Portuguese full-text. Both alternatives were measured and both fail on this
exact pair: *embreagem* is not a substring of *Embreagens*, and
`to_tsvector('portuguese','Embreagens')` yields `'embreagens'` against `'embreag'` for the
singular, so `plainto_tsquery` returns false. Trigram similarity for the pair is **0.615**.
Rationale and rejected alternatives: [research R3](../research.md).

**Requires**: `pg_trgm` and `unaccent` created by the import pipeline, never by hand — the pipeline
must stay reproducible from source with no manual steps (constitution, Technology Constraints).

**Ordering** is unchanged: current parts before discontinued (`001` FR-030), then part number.

---

## 3. Unchanged, listed to be explicit

`list_manufacturers`, `list_vehicle_models`, `get_part`, `get_assemblies`,
`find_cross_reference`, `list_groups` — no change to input, output, or behaviour.

The funnel calls several of these in a different **order** than the model chose before, but the
contracts are untouched. Ordering is conversation policy and belongs to the API; it is not part of
the tool surface.

---

## Contract tests

- `part_count` present on every candidate, and candidates ordered by it. *(exists)*
- Multi-term query matches a description holding the terms non-adjacently. *(exists)*
- A term matching only a parent group returns that group's parts — the *embreagem* → *Embreagens* →
  *Conjunto Veicular* path, asserted against application 16049.
- A term matching neither description, part number, nor group returns empty rather than
  approximate matches (`001` FR-015).
- Accent-insensitive matching: *valvula* and *válvula* return the same rows.
- Every tool call emits one span carrying name, normalised arguments, result count and duration
  (`001` FR-024), and completes within 500 ms.
