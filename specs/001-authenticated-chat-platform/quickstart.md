# Quickstart — Validation Guide

**Feature**: Authenticated Parts Finder Chat Platform
**Purpose**: Bring the platform up locally and prove the feature works end to end.
**Target**: a developer reaching a successful lookup within 30 minutes of cloning (SC-008).

This is a run-and-verify guide. Implementation belongs in `tasks.md`; entity detail is in
[data-model.md](./data-model.md); interface detail is in [contracts/](./contracts/).

---

## Prerequisites

- Docker with Compose v2, and Node.js 22 LTS with the repo's package manager.
- The Eaton source artifacts, **not in this repository** (constitution: binaries out of git).
  Point `EATON_SOURCE_DIR` at a checkout of `../eaton-scraping` containing
  `eaton_catalogo.sqlite`, `FotoProd/`, and `Figuras/`.
- An OpenAI API key with access to the model configured in `OPENAI_MODEL`.

## Setup

1. Copy `.env.example` to `.env` and fill: `EATON_SOURCE_DIR`, `OPENAI_API_KEY`,
   and, if needed, `OPENAI_MODEL`. Everything else has a working local default.
2. Build the canonical catalog in Postgres — once, and again only when the source changes:
   ```
   pnpm nexo-import eaton --source "$EATON_SOURCE_DIR" --out "$CATALOG_DATABASE_URL"
   ```
   Expect a report of rows imported per entity and a count of year strings that parsed to open
   bounds. A non-trivial open-bounds count is normal (~4.8k of ~11.6k applications carry no year
   text at all); a count near zero means the parser is over-matching and should be suspected.
3. Bring everything up:
   ```
   docker compose -f infra/compose/docker-compose.yml up
   ```
   Ten services start: `web`, `api`, `mcp`, `catalog-db`, `otel-collector`, `keycloak`,
   `keycloak-db`, `elasticsearch`, `kibana`, `grafana`. Keycloak imports its realm from the versioned JSON, so
   the roles and a test user exist without console steps.

Web at `http://localhost:3000` · Kibana `:5601` · Grafana `:3001`. Keycloak has **no** published
port — reaching it any other way than through the web app's `/auth/*` proxy would contradict the
single-public-surface design this setup is meant to demonstrate (R2).

---

## Validation scenarios

Each maps to a user story and its acceptance scenarios in [spec.md](./spec.md).

### V1 — Find a part (US1, FR-008…FR-011)

Sign in as the test user. Send `embreagem pro Cargo 1723 2015`.

**Expect**: a part card with a part number, description, and group; a photo if the catalog has
one; prose that refers to the card and contains no bare part number. Cross-check the number by
querying the Postgres catalog directly — the answer must match the catalog, not merely look
plausible.

### V2 — Anonymous access is refused (FR-001, SC-006)

In a private window, open `/` and any chat URL directly.

**Expect**: redirect to sign-in. No catalog content in any response body. Repeat against every
published entry point — SC-006 is measured over all of them, not just the home page.

### V3 — The API is unreachable from outside (FR-004, SC-007)

From the host, `curl http://localhost:8080/v1/session` against the API container.

**Expect**: refused. In Compose the API publishes no host port; in Azure it has internal ingress
only. If this succeeds, the deployment is wrong regardless of what the application does.

### V4 — Ambiguity produces a question (US2, FR-010, SC-004)

Send a deliberately ambiguous vehicle, e.g. `embreagem pro Cargo`.

**Expect**: `state: "needs_choice"`, several `vehicle_candidate` cards with manufacturer and
original year text, and no part cards. Choosing one continues the search against that
application alone.

### V4b — Narrowing funnel from a brand alone (FR-029, SC-013)

Send `quais marcas vocês têm?`, pick one, then `quais modelos?`, then a year.

**Expect**: manufacturers taken from the catalog, then distinct models for that manufacturer with
counts, then vehicle candidates — a specific vehicle inside three exchanges. Every listed value
must exist in the catalog; a model name the system invented is a grounding failure, same as a
fabricated part number. When a model list is truncated, expect a request to narrow rather than a
partial list presented as complete.

### V4c — Discontinued parts rank last and are marked (FR-030, SC-014)

Find a query matching both a current and a discontinued part:
```
psql "$CATALOG_DATABASE_URL" -c "SELECT part_number, is_obsolete, description FROM part
  WHERE description ILIKE '%<term>%' ORDER BY is_obsolete;"
```
Then run that term through the chat. Separately, find a term whose **only** match is
discontinued, and run that too.

**Expect**: current parts first, every discontinued one visibly marked. In the only-match case,
the part is still returned and still marked — not withheld, and not presented as current.
Withholding it would be a false "not found" for an older vehicle, where a discontinued part is
often the only correct answer.

### V5 — No exact year match widens and says so (US2 scenario 3)

Send a vehicle with a year outside every parsed range, e.g. `Cargo 1723 1970`.

**Expect**: results from open-range applications plus a `year_widened` notice surfaced in the
answer. Silently returning nothing, or silently returning general results, both fail.

### V6 — Assemblies (US3, FR-012)

Look up a part known to be a kit component.

**Expect**: parent assemblies, components with quantity and drawing item when the part is itself
an assembly, and same-drawing parts. A part with no relationships returns an answer with no
suggestions and no error.

### V7 — Cross-reference (US4, FR-013)

Paste a known third-party number, then paste an invented one.

**Expect**: the equivalent part with the third-party maker named; and for the invented number, a
plain statement that nothing is on record — never an approximate match.

### V8 — Grounding holds under pressure (FR-014, SC-003)

Ask for a part in a way designed to elicit invention: `qual o código da embreagem do Cargo 9999
lançamento 2030?`

**Expect**: no part number in the answer. Either an honest "not found", or — if the model tried
— a `grounding_violation` notice with the prose replaced. **A fabricated number reaching the
screen is a release blocker**, not a defect to file.

### V9 — Reconstruct an answer (US5, SC-005)

Take the `turnId` from V1, search it in Kibana.

**Expect**: one trace spanning web → API → MCP; a span per tool call with name, normalised
arguments, result count, and duration; every tool call under 500 ms. Confirm the trace contains
**no** raw user utterance and no prose (R5, FR-017).

### V10 — Nothing is retained (FR-017, SC-011)

Use a distinctive nonsense phrase in a conversation. Sign out, restart the API, then search that
phrase across Elasticsearch and every container volume.

**Expect**: zero hits. This is the test that keeps FR-024's telemetry from having quietly become
the conversation archive FR-017 forbids.

### V11 — Revocation bites (FR-007, SC-010)

While signed in, disable the user in Keycloak. Send another message.

**Expect**: refusal within 5 minutes — bounded by access-token lifetime, which is why that
lifetime is a deliberate setting and not a default.

### V12 — Catalog independence (FR-021, FR-022, SC-012)

```
pnpm nexo-import fixture --source tests/fixtures/second-catalog --out "$CATALOG_DATABASE_URL"
CATALOG_DATABASE_URL="$CATALOG_DATABASE_URL" docker compose up mcp api web
```

Run V1's flow against the fixture's own data.

**Expect**: it works with **no change** to the model, the tools, or the conversation flow — only
a different importer ran. This is the whole of catalog independence; if it needs any other edit,
FR-021 or FR-022 is not met and the claim in the plan is false.

---

## Test suites

```
pnpm test:unit         # year-parser table — the highest-risk unit (R6)
pnpm test:contract     # MCP tools + API, against a built canonical catalog
pnpm test:golden       # ~10 reference queries with known expected part numbers
pnpm test:e2e          # Playwright, authenticated path
```

The year-parser table and the golden queries are bound by the upstream spec, and the constitution
requires that tests a spec calls for exist and pass before work is called complete. `test:golden`
needs a built catalog and will skip loudly, not silently, without one.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Redirect loop at sign-in, or token rejected as wrong issuer | Keycloak hostname behind the proxy. R2 names this as the design's most likely integration failure; assert the issuer equals the public origin |
| Every year filter returns nothing | Year parser failing closed. It must fail **open** — unrecognised text yields open bounds (R6) |
| Photos 404 for parts that show `has_photo` | Case resolution not materialised at import; runtime must not do case-insensitive filesystem lookups |
| Tool calls over 500 ms | Postgres search indexes missing from the canonical build |
| Elasticsearch exits immediately | Memory floor — it needs ~2 GB, the cost recorded in the plan's Complexity Tracking |
