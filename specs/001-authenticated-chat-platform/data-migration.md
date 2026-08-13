# Phase 1 — Data Migration: Eaton source → canonical model

**Feature**: Authenticated Parts Finder Chat Platform
**Date**: 2026-08-10
**Implemented by**: `packages/catalog-import/adapters/eaton/`
**Target**: [data-model.md](./data-model.md) · **Source structure**: `../eaton-scraping/GRAFO.md`

This is the complete source→target mapping for the first (and, in the MVP, only) importer.
Everything here is Eaton-specific and MUST NOT leak past this package (FR-021, constitution
§ source-agnostic).

**All counts below were measured directly against `eaton_catalogo.sqlite` on 2026-08-10**, not
inferred from documentation. Four of them corrected assumptions made earlier in this plan; those
are marked ⚠.

---

## 1. `catalog`

Synthesised — the source has no concept of itself.

| Target | Value |
|---|---|
| `catalog_id` | `eaton` |
| `name` | `Catálogo Eaton — Peças Pesadas` |
| `source_format` | `eaton-catalogoexpresso-375` |
| `imported_at` | Import timestamp |
| `source_checksum` | SHA-256 of the source `.sqlite` — ties a deployed image to its data (US5) |

---

## 2. `manufacturer` ← `FABRICANTE` (139 rows)

| Target | Source | Notes |
|---|---|---|
| `manufacturer_id` | `CodigoFabricante` | |
| `name` | `DescricaoFabricante` | |
| `used_for_vehicles` | `FlagAplicacao` | |
| `used_for_cross_reference` | `FlagProduto` | |

⚠ **Correction.** Earlier drafts of `contracts/mcp-tools.md` described this as "139 clean rows"
for the vehicle funnel. It is not one undifferentiated set:

| `FlagProduto` | `FlagAplicacao` | Rows | Meaning |
|---|---|---|---|
| 0 | 1 | **78** | Vehicle makers only |
| 1 | 0 | **53** | Third-party part makers only (cross-references) |
| 1 | 1 | **8** | Both |

So `list_manufacturers` must be **scoped**: 86 manufacturers are valid for the vehicle funnel
(`FlagAplicacao=1`), 61 for cross-references (`FlagProduto=1`). Offering a user a cross-reference
brand as a vehicle make would be a wrong answer produced by the tool itself.

---

## 3. `product_group` ← `GRUPOPRODUTO` (17) + `SUBGRUPOPRODUTO` (27)

Two fixed source levels collapse into one self-referencing hierarchy.

- Each `GRUPOPRODUTO` → one row, `parent_group_id = NULL`, `group_id = "g:{CodigoGrupoProduto}"`.
- Each `SUBGRUPOPRODUTO` → one row, `parent_group_id = "g:{CodigoGrupoProduto}"`,
  `group_id = "s:{CodigoSubGrupoProduto}"`.

Prefixes are required: the two source key spaces are independent integers and would collide.

`DescricaoGrupoProduto` → `description`. The `…E` (Spanish) and `…I` (English) columns are **not
imported** — the spec fixes the interface at pt-BR.

---

## 4. `part` ← `PRODUTO` (11,725 rows)

| Target | Source | Transformation |
|---|---|---|
| `part_id` | `CodigoProduto` | |
| `part_number` | `NumeroProduto` | As displayed, e.g. `MX-11-0601` |
| `part_number_normalized` | `NumeroProdutoPesq` | ⚠ **New** — see below |
| `description` | `DescricaoProduto` | |
| `group_id` | `CodigoSubGrupoProduto` when set, else `CodigoGrupoProduto` | With the prefix from §3 |
| `photo_id` | `ArquivoFotoProduto` | → `asset` via the photo index |
| `note` | `PRODUTO_OBS.Observacao` | RTF → plain text (§10) |
| `drawing_id` | `CodigoFiguraConj` | Nullable; 758 populated |
| `is_assembly` | derived | True when the part appears as `CONJ_PRODS.CodProdConj` |
| `is_obsolete` | derived from `PCs` | ⚠ **New** — see below |

### ⚠ `part_number_normalized` — the punctuation-stripped search key

The source maintains a second, normalised form of every part number, and it matters:

| `NumeroProduto` | `NumeroProdutoPesq` |
|---|---|
| `MX-11-0601` | `MX110601` |
| `X-12-208` | `X12208` |
| `3317831--` | `3317831` |

A user pasting a number from an invoice will type it either way. Without importing this column,
`find_cross_reference` and part-number lookup would miss on punctuation alone — a false "not
found" that looks exactly like a genuine one. Lookups match against the normalised form with the
same normalisation applied to the user's input; the display form is always `part_number`.

### ⚠ `is_obsolete` — parts the catalog marks as discontinued

`PRODUTO.PCs` is populated for **all 11,725 rows**. It is not a description — it is the VB6
app's flattened search blob, containing the part number, cross-reference numbers, and status
markers, `$`-terminated:

```
 1009569 PECA OBSOLETA 21265740 503356241 BH1X7L001DA $
 11453 PECA OBSOLETA TJG301231A $
```

The importer extracts one fact from it — the presence of `PECA OBSOLETA` → `is_obsolete = true` —
and discards the rest, since the cross-reference numbers are already properly modelled in
`REFERENCIACRUZADA`.

**Decided 2026-08-10: rank below current parts** (FR-030). Discontinued parts are ordered last,
never excluded — for an older vehicle a discontinued part is frequently the only correct answer,
and withholding it would produce a false "not found". The flag travels on every result so the
card can mark it, which is what covers the case where a discontinued part is the only match and
ranking therefore does nothing.

**Extraction is deliberately literal**: the exact string `PECA OBSOLETA`, matched
case-insensitively, with no attempt to interpret other markers that may appear in `PCs`. This
field is an undocumented search blob from a VB6 application; inferring further meaning from it
would be guessing about a format nobody specified. If other statuses matter later, they need to
be identified from the data first, the same way this one was.

### Columns deliberately not imported

| Source | Why |
|---|---|
| `PrecoProduto` (all 11,725 non-zero) | The platform is a finder, not a sales tool. Price is not surfaced (FR-011) |
| `Unidade` | ⚠ **Empty in every row.** The upstream spec §5.2 listed it as a returned field; it would have returned nothing |
| `FlagLancamento`, `FlagPromocao`, `FlagPontaEstoque` + their date/validity columns | Promotion-driven suggestion is out of scope (constitution, Principle II inherited exclusions) |
| `CodigoFabricante` | Empty on parts — every part is Eaton's own. A catalog property, not a model rule |
| `ArquivoFotoProduto2`, `ArquivoFotoProduto3` | ⚠ **Empty in every row.** One photo column, not three |
| `CpoAuxProd1…34` | Unlabelled auxiliary fields with no documented meaning |
| `DescricaoProdutoE/I`, `PCsE/I` | Spanish and English; interface is pt-BR |
| `CodigoSimilar` / `SIMILAR` | 2 rows in the entire catalog. Not worth a modelled relationship |

---

## 5. `vehicle_application` ← `APLICACAO` (11,597 rows)

| Target | Source | Transformation |
|---|---|---|
| `application_id` | `CodigoAplicacao` | |
| `manufacturer_id` | `CodigoFabricante` | 11,524 of 11,597 populated |
| `description` | `DescricaoAplicacao` | Free text, as authored |
| `year_text` | `ComplementoAplicacao3_1` | Preserved verbatim for display and audit |
| `year_from`, `year_to` | `ComplementoAplicacao3_1` | **Parsed** — see §9 |

`ComplementoAplicacao3_2…3_61` are not imported: sparse, unlabelled continuation columns.

**Measured year distribution** (top values, confirming the §9 rules):

| Value | Rows |
|---|---|
| *(empty)* | 3,518 |
| `Todos` | 900 |
| `2012/...` | 228 |
| `A partir 2005` | 209 |
| `-` | 188 |
| `Até 2016` | 116 |

Roughly **4,606 applications carry no usable year at all** (empty + `Todos` + `-`). They import
as fully open bounds and match every year, which is the fail-open behaviour R6 argues for.

---

## 6. `part_application` ← `PRODUTO_APLICACAO` (26,182 rows)

Direct copy of `(CodigoProduto, CodigoAplicacao)`. 100% referential integrity in the source, so a
row that fails to join is an import bug, not a data condition — it MUST abort the import rather
than be skipped.

---

## 7. `assembly_component` ← `CONJ_PRODS` (76,601 rows)

| Target | Source | Notes |
|---|---|---|
| `assembly_part_id` | `CodProdConj` | |
| `component_part_id` | `CodProdComp` | |
| `drawing_item` | `ItemFigura` | |
| `quantity` | `Quantidade` | ⚠ Source type is `varchar` |

⚠ **`Quantidade` is text, and 166 rows do not cast to a positive integer.** Inspected: every one
of them is the literal `0`. There is no junk — no ranges, no `N/A`, no free text. So the cast to
INTEGER is safe and a quantity of zero imports as zero rather than being rejected. The importer
still asserts this (any value that is neither empty nor a non-negative integer aborts the
import), because the assertion is what will catch a future catalog release that is messier.

`ItensCompoeComp`, `ItensCompoeCompFig`, `CpoAuxConj1…8` are not imported.

---

## 8. `drawing`, `drawing_item`, and the textual balloon link

`drawing` ← `FIGURA` (3,179): `CodigoFigura` → `drawing_id`, `DescricaoFigura` → `title`,
`ArquivoFigura` → `asset_id` via the asset index.

`drawing_item` ← `FIGURA_ITENS` (84,076): `(CodigoFigura, ItemFigura)`. `PosicaoLeft` /
`PosicaoTop` are balloon coordinates for the original desktop UI and are not imported.

⚠ **`FIGURA_ITENS.CodigoProduto` is NULL in all 84,076 rows** — verified, not assumed. There is
no direct drawing-item→part edge in the source. The link is textual, resolved at import:

```sql
CONJ_PRODS c
  JOIN PRODUTO p       ON p.CodigoProduto  = c.CodProdConj
  JOIN FIGURA_ITENS fi ON fi.CodigoFigura  = p.CodigoFiguraConj
                      AND fi.ItemFigura    = c.ItemFigura
```

**This join yields 9,676 rows out of 76,601 assembly rows — about 12.6%.** That is the real
ceiling on `get_assemblies.same_drawing`, and it follows from only 758 parts having a
`CodigoFiguraConj` at all. The consequence is honest and must not be hidden: for most parts,
`same_drawing` will legitimately be empty. US3 scenario 3 already requires that an empty result
is not an error — this measurement is why that scenario is the common case rather than the edge
case.

---

## 9. Year parsing — `ComplementoAplicacao3_1` → `(year_from, year_to)`

Pure function in `adapters/eaton/parseYearRange.ts`. The highest-risk unit (R6); its test table
is bound by the upstream spec.

Extract every `(19|20)\d\d`, then:

| Input shape | Result | Example |
|---|---|---|
| Empty, `Todos`, `-`, or no 4-digit year | `(null, null)` — open | `Todos` |
| Contains *até* + one year | `(null, YYYY)` | `Até 2016` → `(null, 2016)` |
| Contains *a partir* / *em diante*, or `YYYY/` / `YYYY/...` | `(YYYY, null)` | `2012/...` → `(2012, null)` |
| Two years | `(min, max)` | `2012/2014` → `(2012, 2014)` |
| Anything unrecognised | `(null, null)` — **open** | |

**Failing open is deliberate.** A parser that excludes on doubt hides valid parts and the user
never learns what they did not see. A parser that includes on doubt produces a candidate the
user can reject, and US2's disambiguation exists precisely to handle that.

---

## 10. Assets — `FotoProd/` and `Figuras/`

- Scan both directories once; build a map of `lowercase(filename) → real path`.
- Resolve `PRODUTO.ArquivoFotoProduto` and `FIGURA.ArquivoFigura` through it, storing the
  **already-case-resolved** path. Nothing at runtime performs a case-insensitive filesystem
  lookup.
- **788 of 11,725 parts have a photo (6.7%)**, over 647 distinct files — images are shared
  between parts. A reference to a missing file imports as `photo_id = NULL` with a warning; it
  never aborts the import.

`PRODUTO_OBS.Observacao` is **RTF** — confirmed, every row begins `{\rtf1\ansi\ansicpg1252…`.
Converted to plain text at import. Conversion failure yields `note = NULL` and a warning; the
part still imports (edge case: "unreadable technical note").

---

## 11. Search indexes

Built after load in Postgres: GIN indexes over `to_tsvector('simple', ...)` for parts and
vehicle applications. These carry the 500 ms tool budget.

---

## 12. Reconciliation — the import must assert these

Import fails if any assertion fails. These are the counts measured on 2026-08-10; a future
catalog release will change them, which is the point — a silent change in these numbers means
the source changed underneath us.

| Assertion | Expected |
|---|---|
| `part` rows | 11,725 |
| `vehicle_application` rows | 11,597 |
| `part_application` rows | 26,182, all joining on both sides |
| `assembly_component` rows | 76,601 |
| `cross_reference` rows | 20,834 |
| `drawing` / `drawing_item` | 3,179 / 84,076 |
| `manufacturer` rows | 139, of which 86 vehicle-capable and 61 cross-reference-capable |
| Parts with a resolved photo | 788 |
| Applications with open year bounds | ≥ 4,606 |
| Resolved balloon→component links | 9,676 |
| Parts flagged obsolete | Reported, and reported against the previous import |

Validation run on 2026-08-11 before the Postgres runtime decision, using the same canonical
mapping, produced: `manufacturer=139`, `product_group=44`, `part=11,725`,
`vehicle_application=11,597`, `part_application=26,182`, `drawing=3,179`,
`drawing_item=84,076`, `assembly_component=76,601`, `cross_reference=20,834`, `part_fts=11,725`,
`application_fts=11,597`, and `applications with fully open year bounds=5,199`.

Rows that fail to join where the source has 100% integrity (§6) **abort** the import. Rows with
genuinely optional data (missing photo, unconvertible note) **warn** and continue. The
distinction matters: aborting on a real corruption is what stops a half-loaded catalog from
being served as if it were whole.

---

## 13. `cross_reference` ← `REFERENCIACRUZADA` (20,834 rows)

| Target | Source |
|---|---|
| `cross_reference_id` | `CodigoReferenciaCruzada` |
| `part_id` | `CodigoProduto` |
| `foreign_manufacturer_id` | `CodigoFabricante` |
| `foreign_number` | `NumeroProduto` |
| `foreign_number_normalized` | `NumeroProdutoPesq` |

Same normalisation logic as §4, and for the same reason: this is the table US4 searches, and it
is exactly where a user pastes a punctuated number off an invoice.

---

## 14. Not imported at all

`BANNER`, `TERMOSTRAD` (UI strings and i18n for the desktop app), `INFORMATIVO` (77 technical
bulletins — a separate capability, out of scope for this feature), `CONTROLECHAVE`,
`CONTROLETRAN`, `UMREGISTRO` (licensing and installation bookkeeping), `SIMILAR` (2 rows), and
the pre-built views `v_produto`, `v_produto_aplicacao`, `v_conjunto`, `v_referencia` — the
canonical schema replaces them.

---

## Decisions recorded

**Obsolete parts** — resolved 2026-08-10. Rank below current parts, never exclude, always mark.
See §4 and FR-030. `is_obsolete` is on `PartResult` and every list in `get_assemblies` and
`find_cross_reference` applies the same ordering.

**Catalog independence** — resolved 2026-08-10. The broad reading stands: the abstraction reaches
the tool surface, and the second-catalog fixture is kept (research.md R3). For this document that
means the boundary is absolute — everything in this file is Eaton-specific and lives only in
`packages/catalog-import/adapters/eaton/`. Nothing downstream of the importer may learn the
source format, and the fixture adapter exists to prove it.

**No open items remain.**
