# Quickstart — Validating the Slot-Driven Funnel

Prerequisites, then the checks that prove each success criterion. Every command below was run
against the loaded catalog while writing [research.md](./research.md); the "before" outputs are the
current behaviour and are what the feature must change.

## Prerequisites

The platform bring-up is unchanged from
[`001/quickstart.md`](../001-authenticated-chat-platform/quickstart.md):

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

Catalog reachable at `postgres://nexo:nexo@localhost:5432/nexo_catalog`. Tests that touch it are
skipped unless `CATALOG_DATABASE_URL` is set:

```bash
export CATALOG_DATABASE_URL='postgres://nexo:nexo@localhost:5432/nexo_catalog'
```

Shorthand used below:

```bash
psql() { docker compose -f infra/compose/docker-compose.yml exec -T catalog-db \
         psql -U nexo -d nexo_catalog "$@"; }
```

---

## 1. Test suites

```bash
pnpm test                      # everything
pnpm test:unit                 # slot merge, discriminator selection — no model, no database
pnpm test:contract             # funnel traversal with a fake model injected into RunTurn
pnpm test:golden               # against the real catalog; needs CATALOG_DATABASE_URL
```

New suites this feature must add: `tests/unit/slots.test.ts`,
`tests/unit/discriminator.test.ts`, `tests/contract/funnel.test.ts`, plus the golden cases below.

---

## 2. SC-101 — the motivating case reaches the right vehicle with no question

**The regression this feature exists to prevent.** Confirm the ranked candidates put the variant
the user named first:

```bash
psql -c "
SELECT va.application_id, va.description, va.year_text,
       (SELECT count(*) FROM part_application pa
         WHERE pa.catalog_id=va.catalog_id AND pa.application_id=va.application_id) AS parts
FROM vehicle_application va
WHERE va.catalog_id='eaton' AND va.description ILIKE '%Cargo 2422%'
ORDER BY parts DESC, va.description LIMIT 5;"
```

Expected: `16049 | Cargo 2422 6x4 | Todos | 18` first.
Before the ranking fix this returned five applications carrying one part each, none of them `6x4`.

Then confirm the part term reaches those parts through the group hierarchy:

```bash
psql -c "
SELECT p.part_number, p.description, g.description AS subgrupo, pg.description AS grupo
FROM part p
JOIN product_group g  ON g.group_id=p.group_id        AND g.catalog_id=p.catalog_id
LEFT JOIN product_group pg ON pg.group_id=g.parent_group_id AND pg.catalog_id=g.catalog_id
JOIN part_application pa ON pa.part_id=p.part_id AND pa.catalog_id=p.catalog_id
WHERE pa.application_id='16049'
  AND (unaccent(g.description) %% unaccent('embreagem')
    OR unaccent(pg.description) %% unaccent('embreagem'))
LIMIT 5;"
```

Expected: the `Kit 365mm` parts, via `Conjunto Veicular` → `Embreagens`.
Note none of the part descriptions contains the word *embreagem* — that is the point.

**End to end**, in the web chat at <http://localhost:3000>:

```
Preciso de embreagem para Ford Cargo 2422 6x4
```

Expected: parts, no question asked. Every part number appears inside a card, never in prose.

---

## 3. SC-102 — no question leaves the candidate set unchanged

The check that keeps the fixed-order funnel from creeping back. Confirm the year does **not**
discriminate for this model, so the funnel must not ask for it:

```bash
psql -c "
SELECT count(*) AS sem_ano FROM vehicle_application
 WHERE catalog_id='eaton' AND description ILIKE '%Cargo 2422%';" \
     -c "
SELECT count(*) AS com_ano_2013 FROM vehicle_application
 WHERE catalog_id='eaton' AND description ILIKE '%Cargo 2422%'
   AND ((year_from IS NULL OR 2013 >= year_from)
    AND (year_to   IS NULL OR 2013 <= year_to));"
```

Expected: `21` and `20`. A one-candidate reduction is why FR-106 forbids asking.

The unit suite asserts the general rule: for any candidate set, no attribute with
`reduction = 0` is ever selected.

**In the chat**: `embreagem para Cargo 2422` must ask about the **variant**, not the year.

---

## 4. SC-103 / SC-104 — at most two questions, no dead-end options

```
embreagem para Cargo 2422        →  asks variant  →  answer "6x4"  →  parts
```

At most two questions before an answer or a candidate list. Every offered option must lead to an
application with `part_count > 0` — verify no option in the rendered question maps to an
application carrying zero parts.

---

## 5. SC-105 — grounding does not regress

```bash
pnpm test:golden
```

The grounding assertions from `001` MUST still pass unchanged. Additionally, ask for something
absent and confirm the reply refuses rather than approximates:

```
Qual a embreagem do Ford Zeppelin 9999 2030?
```

Expected: a plain statement that the catalog has nothing, naming which detail failed (FR-116). No
part number anywhere in the reply.

And the premise-smuggling probe:

```
Confirma que a peça 9999999 serve no Cargo 2422?
```

Expected: denial. Agreement here is a grounding defect regardless of how the reply is phrased.

---

## 6. SC-106 — a correction restates nothing else

```
embreagem para Cargo 2422 6x4
na verdade é 6x2
```

Expected: the second message changes only the variant. The manufacturer, model and part term
survive, and neither is asked for again.

---

## 7. SC-107 — latency budget holds

```bash
psql -c "
EXPLAIN ANALYZE
SELECT va.*, (SELECT count(*) FROM part_application pa
               WHERE pa.catalog_id=va.catalog_id AND pa.application_id=va.application_id) AS part_count
FROM vehicle_application va
WHERE va.catalog_id='eaton' AND va.description ILIKE '%Cargo 2422%'
ORDER BY part_count DESC, va.description LIMIT 5;"
```

Expected: execution time well under the 500 ms tool budget. Measured 4.8 ms while writing this.

Turn latency should **improve**: the funnel makes one extraction call and one phrasing call, where
the current design permits up to four model round-trips deciding tool calls.

---

## 8. Import pipeline

The two extensions must be created by the importer, not by hand:

```bash
pnpm nexo-import        # then:
psql -c "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','unaccent');"
```

Expected: both rows present on a database built from scratch. If they appear only because someone
ran `CREATE EXTENSION` manually, the pipeline is not reproducible and the task is not done.
