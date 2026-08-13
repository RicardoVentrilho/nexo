---
description: "Task list for Authenticated Parts Finder Chat Platform"
---

# Tasks: Authenticated Parts Finder Chat Platform

**Input**: Design documents from `/specs/001-authenticated-chat-platform/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [data-migration.md](./data-migration.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: The constitution does not mandate TDD. Test tasks appear here only where the
specification binds them — the year-parser table, the golden queries, the catalog-independence
fixture (SC-012) — plus the grounding-violation test, which exists because the design's central
claim needs something that would fail if it were false (research.md R9).

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and
demonstrated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- All paths are repository-relative

---

## Phase 1: Setup

- [X] T001 Initialise the monorepo: `package.json` with workspaces and `pnpm-workspace.yaml` covering `apps/*` and `packages/*`
- [X] T002 Create `tsconfig.base.json` with `strict: true`, and per-package `tsconfig.json` extending it
- [X] T003 [P] Configure ESLint in `eslint.config.js` with the two boundary rules the constitution requires: only `packages/catalog-import` may import `better-sqlite3` for the legacy source, and no runtime package may import `packages/catalog-import`
- [X] T004 [P] Configure Vitest in `vitest.config.ts` with the `unit`, `contract`, `golden`, and `e2e` projects referenced by `quickstart.md`
- [X] T005 [P] Write `.env.example` with `EATON_SOURCE_DIR`, `CATALOG_DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `KEYCLOAK_*`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- [X] T006 [P] Write `.gitignore` excluding `.data/`, `*.sqlite`, and asset directories — the constitution forbids committing catalog binaries
- [X] T007 [P] Create `infra/docker/Dockerfile.web`, `Dockerfile.api`, `Dockerfile.mcp` — one image per service, no environment-specific build targets (image parity)
- [X] T008 [P] Add CI in `.github/workflows/ci.yml` running typecheck, lint, and the unit and contract suites

---

## Phase 2: Foundational

**Blocking**: no user story can start until this phase completes. Nothing is queryable until a
catalog exists, and nothing is callable until the contracts and the service skeletons exist.

### Shared contracts and domain

- [X] T009 Define shared zod primitives in `packages/contracts/src/primitives.ts`: `CatalogId`, `PartId`, `ApplicationId`, `ManufacturerId`, `PartNumber`
- [X] T010 [P] Define MCP tool input/output schemas in `packages/contracts/src/tools/` — one file per tool, matching `contracts/mcp-tools.md` exactly
- [X] T011 [P] Define API DTOs in `packages/contracts/src/api/` — `TurnRequest`, `TurnResponse`, `Card`, `Notice`, `SessionInfo` per `contracts/api.md`
- [X] T012 [P] Define catalog-agnostic domain entities in `packages/catalog-core/src/entities/` per `data-model.md` — no manufacturer name appears in any type
- [X] T013 [P] Define repository ports in `packages/catalog-core/src/ports/` — the interfaces `apps/mcp` implements against Postgres

### Canonical catalog and the Eaton importer

- [X] T014 Write the canonical Postgres schema DDL in `packages/catalog-import/src/canonical/schema.sql` — all tables from `data-model.md`, every row scoped by `catalog_id`
- [X] T015 Implement the canonical writer in `packages/catalog-import/src/canonical/writer.ts` — idempotent, rebuilds from empty on every run
- [X] T016 [P] Implement the asset index in `packages/catalog-import/src/adapters/eaton/assetIndex.ts` — scan `FotoProd/` and `Figuras/`, map `lowercase(filename)` to real path, store case-resolved (data-migration.md §10)
- [X] T017 [P] Implement RTF-to-plain-text conversion in `packages/catalog-import/src/adapters/eaton/rtf.ts` — failure yields NULL and a warning, never an aborted import
- [X] T018 [P] Implement part-number normalisation in `packages/catalog-import/src/adapters/eaton/normalizeNumber.ts` — mirrors the source's `NumeroProdutoPesq` (`MX-11-0601` → `MX110601`)
- [X] T019 [P] Implement obsolescence extraction in `packages/catalog-import/src/adapters/eaton/obsolete.ts` — literal case-insensitive `PECA OBSOLETA` in `PCs`, nothing else inferred (data-migration.md §4)
- [X] T020 Implement the Eaton adapter core in `packages/catalog-import/src/adapters/eaton/index.ts` — `catalog`, `manufacturer` (with `used_for_vehicles` / `used_for_cross_reference` from `FlagAplicacao` / `FlagProduto`), `product_group` (prefixed `g:` / `s:` keys), `part`, `vehicle_application` (year bounds left NULL for now), `part_application`
- [X] T021 Build Postgres full-text indexes in `packages/catalog-import/src/canonical/fts.ts` — `part` and `vehicle_application` search vectors
- [X] T022 Implement reconciliation assertions in `packages/catalog-import/src/canonical/reconcile.ts` per data-migration.md §12 — abort on failed joins where the source has full integrity, warn and continue on optional data
- [X] T023 Implement the importer CLI in `packages/catalog-import/src/cli.ts` — `nexo-import <adapter> --source <dir> --out <db>`
- [ ] T024 Run the importer against the real source and record actual counts against the §12 table in `data-migration.md`

### Service skeletons

- [X] T025 [P] Implement OpenTelemetry bootstrap in `packages/telemetry/src/index.ts` — OTLP exporter only; no service may reach a backend directly
- [X] T026 [P] Implement the catalog Postgres connection in `apps/mcp/src/catalog/connection.ts` — runtime catalog access uses `pg`, not SQLite
- [X] T027 [P] Create the MCP server skeleton in `apps/mcp/src/server.ts` — tool registration, no tools yet
- [X] T028 [P] Create the Fastify skeleton in `apps/api/src/main.ts` with `/health` and `/ready` per `contracts/api.md`
- [X] T029 Implement JWKS token validation in `apps/api/src/slices/identity/infrastructure/jwtPlugin.ts` — rejects every unauthenticated request before any handler runs
- [X] T030 Implement the `AuthoriseRequest` use case in `apps/api/src/slices/identity/application/authoriseRequest.ts` — role checks server-side (FR-003, FR-006)
- [X] T031 Create the composition root in `apps/api/src/composition/index.ts` — the only place adapters are bound to ports
- [X] T032 [P] Initialise Next.js 15 with React 19, Tailwind, and vendored shadcn/ui primitives in `apps/web/`
- [X] T033 Implement the Keycloak reverse proxy in `apps/web/src/app/auth/[...path]/route.ts` — keeps one public surface (research.md R2)
- [X] T034 Implement the OIDC authorization-code + PKCE flow and session cookie in `apps/web/src/slices/identity/`

### Local environment

- [X] T035 [P] Write the Keycloak realm export in `infra/compose/keycloak/realm-nexo.json` — `user` and `administrator` roles plus a test user, versioned so identity config is never click-ops
- [X] T036 [P] Write the collector config in `infra/compose/otel-collector.yaml` — receives OTLP, exports traces, logs, and metrics to Elasticsearch
- [X] T037 Write `infra/compose/docker-compose.yml` with all ten services: `web`, `api`, `mcp`, `catalog-db`, `otel-collector`, `keycloak`, `keycloak-db`, `elasticsearch`, `kibana`, `grafana`
- [X] T038 Provision the Grafana Elasticsearch datasource and index lifecycle policy (30-day retention) in `infra/compose/grafana/` and `infra/compose/elasticsearch/`
- [X] T039 Verify `docker compose up` reaches a working state with no manual steps beyond `.env` (FR-027, SC-008)

**Checkpoint**: catalog built, all services start, authentication works end to end. No catalog
question can be answered yet.

---

## Phase 3: User Story 1 — Find a part by conversation (P1) 🎯 MVP

**Goal**: an authenticated user types one informal sentence and gets a grounded part number,
description, and photo.

**Independent test**: sign in, send a single informal part request, confirm the response carries
a real part number that matches the same query run directly against the Postgres catalog.

- [X] T040 [P] [US1] Implement the `part-search` domain in `apps/mcp/src/slices/part-search/domain/` — result types, ordering rules
- [X] T041 [US1] Implement the `SearchParts` use case in `apps/mcp/src/slices/part-search/application/searchParts.ts` — FTS over `part_fts`, restricted by `application_id` when given, ordered `is_obsolete ASC, relevance DESC` (FR-030)
- [X] T042 [US1] Implement the `GetPart` use case in `apps/mcp/src/slices/part-search/application/getPart.ts` — full record, note, applications
- [X] T043 [US1] Register `search_parts` and `get_part` in `apps/mcp/src/server.ts` with zod validation on both directions
- [X] T044 [P] [US1] Implement `ListGroups` in `apps/mcp/src/slices/part-search/application/listGroups.ts` — backs the "not found, browse by group" path
- [X] T045 [P] [US1] Implement the grounding ledger in `apps/api/src/slices/conversation/domain/ledger.ts` — append-only `Card[]` per turn, cards numbered for `[[card:N]]` reference
- [X] T046 [US1] Implement the MCP client in `apps/api/src/slices/conversation/infrastructure/mcpClient.ts` — internal transport, one span per call carrying name, normalised arguments, result count, duration
- [X] T047 [US1] Implement the direct OpenAI API client in `apps/api/src/slices/conversation/infrastructure/openAiClient.ts` — API key and model from environment, never hardcoded
- [X] T048 [US1] Implement the `RunTurn` use case in `apps/api/src/slices/conversation/application/runTurn.ts` — the agent loop, capped at 4 tool-call rounds (research.md R7)
- [X] T049 [US1] Implement the answer validator in `apps/api/src/slices/conversation/application/validateGrounding.ts` — rejects prose containing a catalog identifier that resolves to no card; on failure replaces prose, keeps cards, emits a `grounding_violation` notice
- [X] T050 [US1] Implement `POST /v1/conversations/:sessionId/turns` in `apps/api/src/slices/conversation/infrastructure/routes.ts`
- [X] T051 [P] [US1] Implement in-memory session state in `apps/api/src/slices/conversation/infrastructure/sessionStore.ts` — no disk, no external store (FR-017, research.md R8)
- [X] T052 [P] [US1] Implement the authenticated asset passthrough `GET /v1/assets/:catalogId/:assetId` in `apps/api/src/slices/assets/` — `404` is a normal result
- [X] T053 [P] [US1] Build the chat transcript and composer in `apps/web/src/slices/conversation/`
- [X] T054 [US1] Build the part result card in `apps/web/src/slices/result-cards/PartCard.tsx` — renders structured tool results as components, with a visible discontinued marker when `is_obsolete` (FR-030)
- [X] T055 [US1] Render `[[card:N]]` references in prose as links to their cards in `apps/web/src/slices/conversation/Prose.tsx`
- [X] T056 [US1] Write the grounding-violation test in `tests/contract/grounding.test.ts` — an engineered prompt that tries to elicit a fabricated number must not produce one on screen
- [X] T057 [US1] Write the first golden queries in `tests/golden/parts.test.ts` — informal sentence in, known part number out

**Checkpoint**: US1 is demonstrable on its own. A user signs in and finds a part.

---

## Phase 4: User Story 2 — Disambiguate the vehicle (P2)

**Goal**: ambiguous vehicles produce a question, not a guess; and a user who knows only the
manufacturer can narrow down step by step.

**Independent test**: send an ambiguous vehicle, confirm candidates are returned and no parts
are; choose one, confirm the search proceeds against that application alone.

- [X] T058 [P] [US2] Implement `parseYearRange` in `packages/catalog-import/src/adapters/eaton/parseYearRange.ts` per data-migration.md §9 — pure function, fails open on unrecognised input
- [X] T059 [US2] Write the year-parser table test in `tests/unit/parseYearRange.test.ts` — every observed format, plus the assertion that unrecognised input yields open bounds rather than exclusion
- [X] T060 [US2] Extend the Eaton adapter to populate `year_from` and `year_to`, preserving `year_text` verbatim
- [ ] T061 [US2] Re-run the importer and assert that at least 4,606 applications carry open year bounds (data-migration.md §12)
- [X] T062 [P] [US2] Implement the `vehicle-resolution` domain in `apps/mcp/src/slices/vehicle-resolution/domain/` — candidate types, the year matching rule
- [X] T063 [US2] Implement `ResolveVehicle` in `apps/mcp/src/slices/vehicle-resolution/application/resolveVehicle.ts` — FTS plus year filter, with the retry that sets `widened: true` when a year match empties the result
- [X] T064 [P] [US2] Implement `ListManufacturers` in `apps/mcp/src/slices/vehicle-resolution/application/listManufacturers.ts` — `scope` is **required**; 86 vehicle-capable, 61 cross-reference-capable, 8 both
- [X] T065 [P] [US2] Implement `ListVehicleModels` in `apps/mcp/src/slices/vehicle-resolution/application/listVehicleModels.ts` — distinct descriptions per manufacturer with counts, `truncated` flag; no model-family inference
- [X] T066 [US2] Register `resolve_vehicle`, `list_manufacturers`, and `list_vehicle_models` in `apps/mcp/src/server.ts`
- [X] T067 [US2] Implement the `needs_choice` turn state in `apps/api/src/slices/conversation/application/runTurn.ts` — more than one candidate suspends the turn rather than picking one (FR-010)
- [X] T068 [P] [US2] Build the selectable vehicle candidate card in `apps/web/src/slices/result-cards/VehicleCandidateCard.tsx`
- [X] T069 [P] [US2] Surface the `year_widened` and `truncated` notices in `apps/web/src/slices/conversation/Notices.tsx` — a truncated model list must read as "narrow it down", never as a complete list
- [X] T070 [US2] Extend the golden suite in `tests/golden/vehicles.test.ts` — ambiguous input asks, unmatched year widens and says so

**Checkpoint**: US1 and US2 both work. Wrong-vehicle answers are now structurally discouraged.

---

## Phase 5: User Story 3 — See the whole assembly (P3)

**Goal**: a found part shows the kit it belongs to, its components, and same-drawing neighbours.

**Independent test**: look up a part known to belong to a kit; confirm parent kits and components
appear with their own part numbers.

- [X] T071 [US3] Extend the Eaton adapter to import `assembly_component` from `CONJ_PRODS` — `Quantidade` is `varchar`; cast with an assertion that rejects anything other than a non-negative integer (data-migration.md §7)
- [X] T072 [US3] Extend the Eaton adapter to import `drawing` and `drawing_item` from `FIGURA` and `FIGURA_ITENS`
- [X] T073 [US3] Implement the textual balloon-to-component resolution at import per data-migration.md §8, and assert the join yields 9,676 links — `FIGURA_ITENS.CodigoProduto` is NULL in all 84,076 rows and cannot be used
- [X] T074 [P] [US3] Implement the `assemblies` domain in `apps/mcp/src/slices/assemblies/domain/`
- [X] T075 [US3] Implement `GetAssemblies` in `apps/mcp/src/slices/assemblies/application/getAssemblies.ts` — `parent_assemblies`, `components`, `same_drawing`, all ordered `is_obsolete ASC`
- [X] T076 [US3] Register `get_assemblies` in `apps/mcp/src/server.ts`
- [X] T077 [P] [US3] Build the assembly card in `apps/web/src/slices/result-cards/AssemblyCard.tsx` — quantity and drawing item for components
- [X] T078 [US3] Write the empty-result test in `tests/contract/assemblies.test.ts` — `same_drawing` is empty for most parts by data, not by bug; assert empty renders as a normal answer

**Checkpoint**: US1–US3 work. Answers are complete rather than isolated.

---

## Phase 6: User Story 4 — Cross-reference a competitor number (P4)

**Goal**: a third-party part number returns the catalogued equivalent.

**Independent test**: paste a known third-party number and get the equivalent part with the
third-party maker named; paste an invented one and get a plain "not on record".

- [X] T079 [US4] Extend the Eaton adapter to import `cross_reference` from `REFERENCIACRUZADA`, including `foreign_number_normalized`
- [X] T080 [US4] Add the `(catalog_id, foreign_number_normalized)` index in `packages/catalog-import/src/canonical/schema.sql`
- [X] T081 [US4] Implement `FindCrossReference` in `apps/mcp/src/slices/cross-reference/application/findCrossReference.ts` — exact match on the normalised form, no fuzzy matching beyond that
- [X] T082 [US4] Register `find_cross_reference` in `apps/mcp/src/server.ts`
- [X] T083 [P] [US4] Build the cross-reference card in `apps/web/src/slices/result-cards/CrossReferenceCard.tsx`
- [X] T084 [US4] Extend the golden suite in `tests/golden/crossReference.test.ts` — a punctuated number and its unpunctuated form must find the same part

**Checkpoint**: all four catalog entry points work.

---

## Phase 7: User Story 5 — Explain an answer after the fact (P5)

**Goal**: an operator reconstructs which catalog lookups produced any given answer.

**Independent test**: run a chat request, then reconstruct its lookups from the dashboards alone,
without reading source code.

- [ ] T085 [US5] Instrument the web application in `apps/web/src/slices/conversation/` to start the trace and propagate W3C context to the API
- [ ] T086 [US5] Make `turnId` equal the trace id in `apps/api/src/slices/conversation/application/runTurn.ts` — this is what makes the operator's search a single lookup
- [X] T087 [US5] Enforce the telemetry boundary in `packages/telemetry/src/redaction.ts` — normalised arguments only; raw utterance and prose are never attached to a span, log, or attribute (research.md R5)
- [ ] T088 [P] [US5] Build the Kibana trace and log views in `infra/compose/kibana/`
- [ ] T089 [P] [US5] Build the Grafana dashboards in `infra/compose/grafana/dashboards/` — tool latency against the 500 ms budget, turn duration, grounding violations, error rate
- [ ] T090 [US5] Write the failed-turn trace test in `tests/e2e/failedTurn.spec.ts` — a turn that fails still emits a complete trace identifying the failure point (US5 scenario 3)

**Checkpoint**: every story delivered. The platform is auditable.

---

## Phase 8: Polish & Cross-Cutting

### Catalog independence — the claim that needs proving

- [ ] T091 Build a second catalog fixture in `tests/fixtures/second-catalog/` — deliberately a different source format, small, sharing no structure with the Eaton export
- [X] T092 Implement the fixture adapter in `packages/catalog-import/src/adapters/fixture/index.ts`
- [ ] T093 Write the catalog-independence test in `tests/contract/catalogIndependence.test.ts` — every tool runs against both catalogs with no tool-side branching (SC-012)

### Security and privacy verification

- [ ] T094 [P] Write the unauthenticated-access test in `tests/e2e/anonymous.spec.ts` — every published entry point, not just the home page (SC-006)
- [ ] T095 [P] Write the private-network test in `tests/e2e/apiReachability.spec.ts` — the API refuses requests from outside (SC-007)
- [ ] T096 [P] Write the retention test in `tests/e2e/noRetention.spec.ts` — a distinctive phrase used in conversation is absent from Elasticsearch and every volume after sign-out and restart (SC-011)
- [ ] T097 Write the token-issuer test in `tests/contract/issuer.test.ts` — a freshly minted token's `iss` equals the public origin; this is the failure mode the Keycloak proxy is most likely to produce (research.md R2)
- [ ] T098 Write the revocation test in `tests/e2e/revocation.spec.ts` — access disabled in Keycloak stops working within 5 minutes (SC-010), and set the access-token lifetime deliberately rather than by default

### Infrastructure

- [ ] T099 [P] Write the network module in `infra/terraform/modules/network/` — VNet, subnets, and internal-only ingress for everything except the web application
- [ ] T100 [P] Write the container-apps module in `infra/terraform/modules/container-apps/`
- [ ] T101 [P] Write the observability module in `infra/terraform/modules/observability/` — Elasticsearch with its memory floor and persistent storage, Kibana, Grafana
- [ ] T102 [P] Write the Keycloak module in `infra/terraform/modules/keycloak/` — with PostgreSQL and realm import
- [ ] T103 [P] Wire the OpenAI runtime secrets into the container-apps Terraform module — no managed model-service resource is provisioned
- [ ] T104 Compose the `dev` environment in `infra/terraform/envs/dev/` with remote, locked state
- [ ] T105 Add the catalog import to CI in `.github/workflows/build-catalog.yml` — produces the canonical database and bakes it with its assets into the MCP image (research.md R4)

### Closing out

- [ ] T106 Run every scenario in [quickstart.md](./quickstart.md) V1–V12 against a fresh environment and record the results
- [ ] T107 Write the performance budget test in `tests/contract/performance.test.ts` — every tool call under 500 ms against a built catalog, and 95% of turns answering within 5 seconds (SC-002)
- [ ] T108 Write `README.md` — what the platform is, how to bring it up, and where the specification lives

---

## Dependencies

**Phase order**: Setup → Foundational → US1 → US2 → US3 → US4 → US5 → Polish.

**Hard blocks**:
- Everything blocks on Phase 2. There is no catalog to query and no authenticated route until it
  completes.
- T041 (search ordering) depends on T019 (obsolescence extraction) — FR-030 is an ordering rule
  and needs the flag to exist first.
- T063 (`resolve_vehicle`) depends on T060–T061 (year bounds populated). Calling it before the
  backfill returns results filtered against NULL bounds, which silently matches everything.
- T075 (`get_assemblies`) depends on T073 (balloon resolution materialised).
- T081 (`find_cross_reference`) depends on T079–T080 (normalised column and its index).
- T086 (`turnId` = trace id) depends on T085 (trace started upstream).
- T093 depends on T091–T092, and on every tool existing — it is the last thing that can run.

**Story independence**: US2, US3, and US4 each touch their own MCP slice, their own importer
extension, and their own card component. Once Phase 2 is done they can proceed in parallel by
different people. US5 instruments what the others built and is best done after at least US1.

---

## Parallel execution examples

**Phase 2, after T009**: T010, T011, T012, T013 are four different packages — four people, no
contention.

**Phase 2, importer**: T016, T017, T018, T019 are four independent pure modules under
`adapters/eaton/`, all feeding T020.

**Phase 3**: T045 (ledger, API) ‖ T053 (chat UI, web) ‖ T040 (search domain, MCP) — three
services, no shared files.

**Phase 8**: T099–T103 are five independent Terraform modules; T094, T095, T096 are three
independent test files.

---

## Implementation strategy

**MVP is Phase 1 + Phase 2 + Phase 3 (US1)** — T001 through T057. That delivers a signed-in user
typing an informal sentence and getting a grounded part number with its photo. It is worth
deploying on its own: it already beats the legacy VB6 catalog.

Be aware that Phase 2 is large relative to the MVP. That is not accidental — an authenticated,
observable, containerised platform with an imported catalog has an irreducible floor, and this
plan pays it once rather than smearing it across stories. The compensation is that Phases 4–7
are then genuinely small and genuinely parallel.

**Ship order after the MVP**: US2 next, and not for its own sake — it is what makes US1 safe.
Without disambiguation, US1 confidently answers ambiguous questions, and vehicle model and year
are free text in the source. Treat US1-alone as a pilot with a named group, not a general
rollout.

Then US3, US4, US5 in any order the team prefers.

---

## Settled decisions

**Catalog independence — broad reading, fixture kept** (confirmed 2026-08-10, research.md R3).
The abstraction reaches the tool surface. T091, T092, and T093 stay, and SC-012 remains an
end-to-end test rather than a schema assertion.

This has a consequence worth stating for whoever picks up Phase 3: **every MCP tool written from
T041 onward must be reviewable against the fixture, not just against Eaton.** A tool that would
need a branch to serve a second catalog fails T093 — and T093 runs last, which is the worst place
to discover it. The cheap discipline is to ask, at each tool, "would this work if the catalog
were something else?" The expensive alternative is reworking the tool surface in Phase 8.

**No open items remain.** All questions raised during specification and planning have been
answered: telemetry self-hosting, conversation retention, roles, finder-not-sales framing,
obsolete-part ranking, and catalog independence.
