# Implementation Plan: Authenticated Parts Finder Chat Platform

**Branch**: `master` (no feature branch created — no `before_specify` git hook is installed) | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-authenticated-chat-platform/spec.md`

## Summary

Deliver a parts finder as an authenticated web chat. A user signs in through Keycloak, describes
a vehicle and a part in informal Portuguese, and the agent answers with a grounded part number,
its photo, and the assemblies it belongs to.

The technical core is a **grounding ledger**: the language model never types a part number.
Every catalog fact reaches the screen as a structured card produced by an MCP tool call and
recorded in a per-turn ledger; the model's prose may only reference cards by id, and a validator
rejects any answer whose prose contains a catalog identifier that is not in the ledger. This
turns FR-014 from a prompt instruction into a mechanical property of the pipeline.

The second structural decision is a **canonical catalog**. The Eaton MS Access/Jet4 export is
treated as an input format, not as the platform's model. An import pipeline normalises it —
free-text Portuguese year ranges into integer bounds, case-insensitive photo filenames into a
resolved index, descriptions into PostgreSQL search indexes — and writes a catalog-agnostic
Postgres database that the MCP server reads through `pg`. Adding a second catalog is a new
importer, not a runtime model change (FR-021, FR-022, SC-012).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS across every service (constitution:
TypeScript everywhere, including the MCP server, superseding the upstream spec's Python).

**Primary Dependencies**: Next.js 15 (App Router) + React 19 + shadcn/ui + Tailwind for the web;
Fastify for the internal API; `@modelcontextprotocol/sdk` for the MCP server; `openai` SDK
using the direct OpenAI API; `zod` for every boundary schema; `pg` for catalog reads;
`better-sqlite3` only inside the importer to read the legacy Eaton source SQLite;
`@opentelemetry/*` for instrumentation; `openid-client` + `jose` for OIDC and JWT validation.

**Storage**:
- Canonical catalog — PostgreSQL, loaded by the import pipeline into the `catalog-db` Docker
  image/service and read at runtime only by the MCP server.
- Keycloak — PostgreSQL (its own store; the only writable database in the platform).
- Telemetry — Elasticsearch.
- Conversations — **none**. FR-017 forbids persistence; turn state lives in server memory keyed
  by session for the life of the session.

**Testing**: Vitest for unit and integration; Playwright for the authenticated end-to-end path.
Two suites are bound by the spec and are not optional: the year-parser unit table and the ~10
golden end-to-end queries. A third is bound by SC-012: the second-catalog fixture.

**Target Platform**: Azure Container Apps in a VNet-integrated environment, provisioned by
Terraform. Identical images run locally under Docker Compose.

**Project Type**: Monorepo — two deployed applications (web, API) plus the MCP server, over
shared domain packages. Vertical slices with Clean Architecture layering inside each slice.

**Performance Goals**: Each MCP tool call under 500 ms against the indexed canonical catalog
(spec success criterion). First substantive answer within 5 s for 95% of requests (SC-002),
which budgets roughly: ≤500 ms tool calls × up to 3 calls, plus model latency.

**Constraints**: One publicly reachable surface (FR-004) — which forces the Keycloak proxy
decision in research.md. No catalog access outside the MCP server (FR-018). No conversation
retention (FR-017) while still recording lookup telemetry (FR-024) — the boundary between the
two is drawn in research.md.

**Scale/Scope**: Internal tool. Tens of concurrent users, not thousands. Catalog is ~11.7k
parts, ~11.6k vehicle applications, ~26.2k part↔application links, ~76.6k kit rows, ~84.1k
drawing items, ~20.8k cross-references, ~53 MB source, ~2.3k asset files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.3.0**.

| Gate | Verdict | Evidence |
|---|---|---|
| I. Spec-Driven Delivery | PASS | `spec.md` approved before this plan. Divergences from the 2026-08-06 upstream spec are named in the spec's Assumptions (six points) and reasserted in research.md. |
| I. Inherited design named | PASS | Upstream tool surface, year-parser rules, and edge cases carried into `contracts/mcp-tools.md`; the four superseded points are called out where they bite. |
| II. Simplicity & YAGNI | PASS with justification | Five application services as constitutionally fixed. Four supporting services (Elasticsearch, Kibana, Grafana, Keycloak's Postgres) are recorded in Complexity Tracking, as Principle II requires for self-hosting decisions. |
| II. Inherited exclusions honoured | PASS | No pricing, stock, ERP, or promotion logic. Price is not among the fields returned to the user (FR-011). |
| III. Observability / OTel | PASS | OTLP to the collector only; no service talks to a backend directly. Collector is the single fan-out point. |
| III. Answer traceability | PASS | One trace per turn; one span per tool call carrying name, arguments, result count, latency; W3C trace context propagates web → API → MCP. |
| Tech: TypeScript everywhere | PASS | No Python anywhere, including the importer. |
| Tech: monorepo | PASS | See Structure Decision. |
| Tech: OpenAI API, env-configured | PASS | API key and model id come from env; no Azure endpoint or deployment name is used. |
| Tech: MCP is the only catalog path | PASS | Runtime catalog reads use `pg` only from `apps/mcp`; `better-sqlite3` is confined to the import package for the legacy Eaton source. Enforced by lint rule, not convention. |
| Tech: catalog read-only | PASS | Application services have read-only runtime intent; catalog mutation is confined to the importer/migration flow against Postgres. |
| Tech: source-agnostic model | PASS | Jet4 layout, Portuguese year strings, and photo-filename casing exist only in `packages/catalog-import/adapters/eaton/`. SC-012's fixture adapter proves the boundary. |
| Tech: tool schemas declared + validated | PASS | zod schemas in `packages/contracts`, shared by server and caller. |
| Tech: binaries out of git | PASS | Source `.sqlite` and asset folders stay in `../eaton-scraping`, referenced by env; the built canonical DB is a CI artifact. |
| Tech: image parity | PASS | One Dockerfile per service; local and Azure differ only by environment. |
| Infra: Terraform only | PASS | Every Azure resource in `infra/terraform`. No portal steps in any runbook. |
| Identity: Keycloak, server-side authz | PASS | API validates JWT per request; roles checked server-side. |
| Identity: MCP not publicly reachable | PASS | Internal ingress only; no route from the browser. |
| Frontend: shadcn/ui, vendored, single kit | PASS | Components vendored under `apps/web/src/components/ui`. No second component library. |
| Frontend: structured tool results | PASS | Result cards are React components fed by the ledger, not model-authored markdown. |
| Gate: Grounding | PASS | Enforced mechanically by the ledger and the answer validator. |

**Result: PASS.** One item requires justification and is recorded in Complexity Tracking.

### Post-design re-check (after Phase 1)

Re-evaluated against the artifacts actually produced. **Still PASS**, with three notes the design
surfaced that the pre-design pass could not have seen:

- **FR-004 nearly failed.** OIDC requires the browser to reach the identity provider, which
  collides head-on with "exactly one publicly reachable surface". Resolved in R2 by proxying
  Keycloak under the web app's origin rather than by giving it public ingress. Had the design
  gone the other way, this gate would have failed and needed a spec amendment, not a
  Complexity Tracking entry.
- **FR-024 versus FR-017 is now a concrete rule, not a tension.** R5 fixes what a span may carry
  — normalised arguments, never the raw utterance or the prose — and sets 30-day retention.
  V10 in the quickstart is the test that keeps it honest.
- **The Grounding Gate became structural.** R1 moves it from prompt discipline to a ledger plus
  a validator, with a test (R9) whose job is to try to break it. This is what changes the gate
  from something a reviewer must remember to check into something the pipeline enforces.

Two constitution TODOs are resolved by this plan: `TODO(DATA_HOSTING)` in R4 (canonical catalog
loaded into Postgres `catalog-db`, assets normalised by the importer) and
`TODO(KEYCLOAK_PERSISTENCE)` in R10 (PostgreSQL, realm imported from a versioned JSON file).

## Project Structure

### Documentation (this feature)

```text
specs/001-authenticated-chat-platform/
├── plan.md              # This file
├── spec.md              # Approved specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── data-migration.md    # Phase 1 output — Eaton source → canonical mapping
├── contracts/           # Phase 1 output
│   ├── mcp-tools.md     # The catalog tool surface
│   └── api.md           # Web ↔ API contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/
├── web/                              # Public surface. Next.js 15 + React 19 + shadcn/ui
│   └── src/
│       ├── app/
│       │   ├── (chat)/               # Slice: conversation UI
│       │   ├── auth/[...path]/       # Keycloak reverse proxy (keeps one public surface)
│       │   └── api/bff/              # Server-only calls into the internal API
│       ├── slices/
│       │   ├── conversation/         # Chat transcript, composer, turn state
│       │   ├── result-cards/         # Part, kit, drawing, cross-reference cards
│       │   └── identity/             # Session, sign-in/out, role gating
│       └── components/ui/            # Vendored shadcn primitives
│
├── api/                              # Internal only. Fastify. Agent orchestration
│   └── src/
│       ├── slices/
│       │   ├── conversation/
│       │   │   ├── domain/           # Turn, Ledger, CardRef, AnswerDraft
│       │   │   ├── application/      # RunTurn, ComposeAnswer, ValidateGrounding
│       │   │   └── infrastructure/   # OpenAI client, MCP client, http routes
│       │   ├── identity/
│       │   │   ├── domain/           # Principal, Role
│       │   │   ├── application/      # AuthoriseRequest
│       │   │   └── infrastructure/   # JWKS verification, Fastify auth plugin
│       │   └── assets/               # Authenticated photo/figure passthrough
│       └── composition/              # Wiring; the only place adapters meet use cases
│
└── mcp/                              # Internal only. The single catalog path
    └── src/
        ├── slices/
        │   ├── vehicle-resolution/   # domain / application / infrastructure
        │   │                         # funnel: manufacturers → models → model+year
        │   ├── part-search/
        │   ├── assemblies/
        │   └── cross-reference/
        ├── catalog/                  # Read-only connection, query helpers
        └── server.ts                 # Tool registration
│
packages/
├── catalog-core/                     # Catalog-agnostic domain: entities + repository ports
├── catalog-import/                   # Source-format knowledge lives ONLY here
│   ├── adapters/
│   │   ├── eaton/                    # Jet4 reader, year parser, photo index, RTF
│   │   └── fixture/                  # Second catalog for SC-012
│   ├── canonical/                    # Postgres schema creation, search indexes, write path
│   └── cli.ts                        # `nexo-import <adapter> --out <db>`
├── contracts/                        # zod schemas: tool I/O, API DTOs, card shapes
└── telemetry/                        # OTel bootstrap shared by all three services

infra/
├── terraform/
│   ├── modules/{network,container-apps,keycloak,observability}/
│   └── envs/{dev,prod}/
├── compose/
│   ├── docker-compose.yml            # 9 services
│   └── otel-collector.yaml
└── docker/                           # One Dockerfile per service

tests/
├── unit/                             # Year parser table (highest-risk unit)
├── integration/                      # Tool contracts against a built canonical DB
├── golden/                           # ~10 reference queries from the upstream spec
└── e2e/                              # Playwright, authenticated path
```

**Structure Decision**: Monorepo with **vertical slices** as the primary axis and Clean
Architecture layering *inside* each slice. A slice owns its `domain/` (entities and rules, no
imports outward), `application/` (use cases, depending only on domain and on ports), and
`infrastructure/` (adapters implementing those ports — SQL, HTTP, the model client). Dependencies
point inward only; `composition/` is the single place where adapters are bound to ports.

Slices were cut along the spec's user stories, so a story maps to a directory: `part-search` is
US1, `vehicle-resolution` is US2 — including the manufacturer → model → model+year narrowing
funnel of FR-029 — `assemblies` is US3, `cross-reference` is US4. US5 is cross-cutting and lives
in `packages/telemetry`. This is what makes the stories independently
deliverable in the way the spec claims: US1 ships with `part-search` and a stub resolver, and
US2 replaces the stub without touching the other slices.

`packages/catalog-core` holds the catalog-agnostic domain shared between the importer and the
MCP server. `packages/catalog-import` is the quarantine for everything Eaton-shaped — the
constitution's source-agnostic rule is enforced by that package boundary plus a lint rule
forbidding any other package from importing it at runtime.

## Complexity Tracking

> Filled because the Constitution Check flagged one item requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Five supporting infrastructure services beyond the five application services: Elasticsearch, Kibana, Grafana, PostgreSQL for Keycloak, and PostgreSQL for the canonical catalog (ten Compose services in total) | The project owner decided on 2026-08-11 that the catalog database used by the platform must be Postgres, replacing the earlier SQLite runtime decision. Keycloak's Postgres is still not optional: Keycloak's dev-mode in-memory store loses realm and user state on restart, which would break FR-007's revocation guarantee. | Managed Azure Monitor + Azure Managed Grafana was offered and declined. SQLite was rejected for the catalog runtime by owner direction. Prometheus was dropped from the design so Grafana reads Elasticsearch directly, saving another supporting service. |
| **Operational cost this incurs** | Elasticsearch is the heaviest component in the platform — it needs a memory floor (2 GB minimum for a usable single node), persistent storage, index lifecycle management to stop unbounded growth, and version-coupled upgrades with Kibana. Retention is set at 30 days for traces and logs (see research.md, telemetry retention), which is also what keeps FR-024's no-backdoor-archive promise honest. Backup is deliberately **not** configured: telemetry is reconstructible-by-waiting, and SC-011 is easier to hold if old telemetry simply expires. | — |
