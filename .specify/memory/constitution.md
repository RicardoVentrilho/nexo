<!--
SYNC IMPACT REPORT
==================
Version change: 1.3.0 → 1.3.1
Bump rationale: PATCH. Both outstanding follow-up TODOs were answered by feature 001's plan;
                the constitution was still carrying them as open. Nothing required changed.

Resolved:
  - TODO(DATA_HOSTING) → canonical catalog and assets baked into the MCP image as a CI artifact
    (specs/001-authenticated-chat-platform/research.md R4). Runtime location still comes from
    environment configuration, so the Technology Constraints rule is unchanged in substance.
  - TODO(KEYCLOAK_PERSISTENCE) → PostgreSQL, with realm configuration versioned as a JSON export
    in the repository and imported at startup (research.md R10). This is what keeps identity
    configuration out of the click-ops that Principle II and the Infrastructure rule forbid.

**No follow-up TODOs remain open in this constitution.** The two listed under the 1.1.0 report
below are historical; both are now closed by the entries above.

Prior report (1.2.0 → 1.3.0) retained below for history.

------------------------------------------------------------------------------
Version change: 1.2.0 → 1.3.0
Bump rationale: MINOR. The project owner corrected two things about the product itself:
                (a) it is a parts finder, not a sales tool — the "upsell" framing inherited
                from the 2026-08-06 upstream spec is wrong for this project; suggestions serve
                completeness of the answer, not basket value; and (b) the MVP loads only the
                Eaton catalog, but the data model must be catalog-agnostic. New durable
                constraint added; nothing previously compliant became non-compliant.

Amended in 1.3.0:
  - Project Context — reframed as a finder; single-catalog MVP on a multi-catalog model
  - Technology Constraints › Models and catalog access — new source-agnostic catalog rule:
    catalog-scoped identifiers, no manufacturer names in the model, source-format knowledge
    confined to an import layer

Prior report (1.1.0 → 1.2.0) retained below for history.

------------------------------------------------------------------------------
Version change: 1.1.0 → 1.2.0
Bump rationale: MINOR. Principle II's "service count is fixed at five" rule was too narrow: it
                conflated application services with supporting infrastructure. Feature 001 took
                an explicit decision to self-host the telemetry backends (log store, Kibana,
                Grafana) in every environment, which the rule as written would have forbidden
                rather than governed. The rule now distinguishes the two categories and demands
                that any self-hosting decision be written down in a feature spec and costed in
                Complexity Tracking. Nothing previously compliant became non-compliant, so this
                is MINOR rather than MAJOR.

Amended in 1.2.0:
  - Principle II — "Application services are fixed at five" + new supporting-services rule
  - Principle III — collector is the single point deciding telemetry destination; services MUST
    NOT talk to a telemetry backend directly
  - Technology Constraints › Services and runtime — Compose covers supporting services too

Prior report (1.0.0 → 1.1.0) retained below for history.

------------------------------------------------------------------------------
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR. Project context, domain constraints, and technology decisions were
                materially expanded after the project's purpose and its infrastructure
                requirements were disclosed (Eaton parts catalog conversational agent;
                Terraform, Docker Compose, Keycloak, OpenTelemetry, shadcn/ui). No principle
                was removed or redefined in a backward-incompatible way; the three ratified
                principles keep their names and intent, gaining domain-specific rules.

Principles (3 — unchanged from 1.0.0):
  - I. Spec-Driven Delivery   — expanded: inherited upstream spec handling
  - II. Simplicity & YAGNI    — expanded: inherited out-of-scope list
  - III. Observability        — expanded: OpenTelemetry as the mechanism; tool-call spans

Added sections:
  - Project Context (new ## section, between title and Core Principles)

Expanded sections:
  - Technology Constraints — monorepo scope, TypeScript-everywhere (incl. MCP server),
    direct OpenAI API, Terraform-only provisioning, five-service Docker Compose,
    Keycloak/OIDC, OpenTelemetry, shadcn/ui, read-only SQLite, binaries excluded from git
  - Development Workflow & Quality Gates — Grounding Gate, latency budget, Terraform plan
    review, inherited test suites

Removed: TODO(PROJECT_PURPOSE) and TODO(AUTH_MODEL) from 1.0.0 — both resolved.

Decisions recorded that SUPERSEDE the upstream spec
(`../eaton-scraping/docs/superpowers/specs/2026-08-06-buscador-pecas-eaton-mcp-design.md`):
  - §1 "roda 100% local, sem serviço externo"  → superseded: hosted on Azure
  - §1 out-of-scope "canais externos / web widget" → superseded: web chat IS the deliverable
  - §1 out-of-scope "autenticação, multiusuário" → superseded: authenticated platform (Keycloak)
  - §3 client = Claude Desktop/Code → superseded: own web app using the direct OpenAI API
  - §8 "Linguagem: Python 3" → superseded: TypeScript for the MCP server too
  Everything else in that spec (data model, 5 tools, year parser, upsell, edge cases,
  golden tests) remains normative input.

Templates checked:
  ✅ .specify/templates/plan-template.md — Constitution Check (L39) and Complexity Tracking
     (L106-110) remain valid; Technical Context fields now have concrete answers.
  ✅ .specify/templates/spec-template.md — no change needed.
  ✅ .specify/templates/tasks-template.md — no change needed; "Tests are OPTIONAL" stays
     consistent (this constitution still does not mandate TDD).
  ✅ .specify/templates/checklist-template.md — no constitution references.
  ✅ CLAUDE.md — SPECKIT block unchanged and consistent.

Follow-up TODOs:  [BOTH CLOSED IN 1.3.1 — see the report at the top of this file]
  - TODO(DATA_HOSTING): where eaton_catalogo.sqlite (~53 MB) and the asset folders live in
    Azure — baked into the MCP image, mounted volume, or blob storage — is a plan-level
    decision, still open.
  - TODO(KEYCLOAK_PERSISTENCE): Keycloak needs a persistent datastore in Azure; which one,
    and how realm configuration is versioned, is still open.
-->

# Nexo Constitution

## Project Context

Nexo is a conversational **parts finder**, delivered as an authenticated web chat platform.
Staff at the distributor log in, describe a vehicle and a part in plain Portuguese —
*"embreagem pro Cargo 1723 2015"* — and the agent returns the correct part number, the product
photo when one exists, and the assemblies the part belongs to (complete kit, parts from the
same exploded drawing).

It is a finder, not a sales tool. Suggestions exist so that an answer is complete, not to raise
basket value; pricing, stock, and order flows are out of scope. The MVP loads a single catalog,
**Eaton heavy-duty parts**, on a model that must already admit others.

- **Data origin**: `CatalogoExpresso.c01`, an MS Access/Jet4 database disguised by the VB6
  application *CatálogoExpresso 3.75*, extracted and converted to `eaton_catalogo.sqlite`
  (~53 MB). Roughly 11.7k products, 11.6k vehicle applications, 26.2k product↔application
  links, 76.6k kit/BOM rows, 20.8k third-party cross-references, plus `FotoProd/` and
  `Figuras/` asset folders.
- **Shape**: five containerized services — web application, API, MCP server, OpenTelemetry
  collector, and Keycloak for identity. The same images run locally under Docker Compose and
  on Azure, provisioned by Terraform. Reasoning uses the direct OpenAI API; catalog access
  is exclusively through MCP tools backed by the SQLite database.
- **Upstream design inputs** (normative except where this constitution supersedes them):
  `../eaton-scraping/GRAFO.md` (entity graph, validated join integrity) and
  `../eaton-scraping/docs/superpowers/specs/2026-08-06-buscador-pecas-eaton-mcp-design.md`
  (tool surface, year parser, suggestion rules — framed there as upsell — and edge cases).

## Core Principles

### I. Spec-Driven Delivery

The specification is the source of truth; code is its consequence.

- Every feature MUST have an approved `spec.md` before a `plan.md` is written, and an
  approved `plan.md` before implementation begins.
- Ambiguity MUST be resolved in the spec, not in code. Anything a reviewer would have to
  guess at is a defect in the spec.
- When implementation reveals the spec is wrong, the spec MUST be amended first. Code
  that silently diverges from its spec is treated as a bug regardless of whether it works.
- Every user story in a spec MUST be independently testable and independently
  demonstrable — a story that cannot be shown working on its own is not yet a story.
- **Inherited design**: the 2026-08-06 upstream spec predates this project and assumes a
  local, Python, Claude-Desktop tool. Where it conflicts with Technology Constraints below,
  this constitution governs. Any Nexo spec that supersedes part of it MUST say so explicitly
  and name what it replaces — silent divergence from the upstream design is prohibited.

**Rationale**: Spec-first is what makes this project reviewable by anyone other than its
author, and what lets the plan and task artifacts stay trustworthy over time. Skipping
straight to code is faster for exactly one feature and slower for every one after it.

### II. Simplicity & YAGNI

Build the smallest thing that satisfies the spec.

- Abstractions, layers, and configuration options MUST be introduced in response to a
  requirement that exists today, never one that is anticipated.
- Every new runtime dependency MUST be justified in the plan: what it replaces, and why
  the standard library or existing dependencies are insufficient.
- Any deviation from the simplest viable design MUST be recorded in the plan's Complexity
  Tracking table, naming the simpler alternative and why it was rejected. An unjustified
  deviation blocks the plan.
- Deleting code is a first-class contribution. Unused code MUST be removed, not commented
  out or feature-flagged indefinitely.
- **Inherited exclusions**: real-time pricing, stock levels, ERP integration, and
  promotion-flag-based upsell were placed out of scope by the upstream spec and REMAIN out
  of scope until a new approved spec brings them in.
- **Application services are fixed at five** — web, API, MCP, OpenTelemetry collector,
  Keycloak. A sixth application service is a Complexity Tracking entry requiring
  justification, not a default move.
- **Supporting infrastructure services** (telemetry backends, identity datastore) are permitted
  where a self-hosting decision has been taken explicitly and recorded in the feature spec that
  took it. Each one MUST carry its operational cost — sizing, retention, backup, upgrade — in
  that feature's Complexity Tracking. Self-hosting is never the default; it is a decision that
  gets written down.

**Rationale**: Speculative generality is the dominant source of long-lived cost in a
codebase, and it is nearly impossible to remove once other code depends on it. Requiring
written justification at plan time makes the cost visible while it is still cheap to avoid.

### III. Observability

If a failure cannot be diagnosed from its output, the feature is incomplete.

- **OpenTelemetry is the telemetry standard.** Traces, metrics, and logs MUST be emitted via
  OTLP to the collector, which is the single point that decides where telemetry is stored.
  Services MUST NOT invent private telemetry channels, write ad-hoc log files, or talk to a
  telemetry backend directly.
- All logging MUST be structured, MUST carry trace and correlation identifiers, and MUST NOT
  contain secrets, credentials, or personally identifying data.
- Errors MUST propagate actionable context: what was attempted, with which inputs
  (redacted as needed), and why it failed. Swallowed errors and bare `catch {}` blocks are
  prohibited.
- **Answer traceability**: each agent turn MUST be a single trace, and each MCP tool call
  within it MUST be a span carrying tool name, arguments, result count, and latency. Given a
  trace, it MUST be possible to reconstruct which catalog rows produced the answer. An answer
  whose provenance cannot be reconstructed is an observability defect, independent of whether
  it was correct.
- The trace MUST cross service boundaries: context propagates web → API → MCP. A tool call
  that appears as an orphan trace is a defect.
- A feature is not done until its failure modes are observable in the same way its success
  path is.

**Rationale**: A web app and its backend fail in production, asynchronously, for users who
will not file a useful bug report. Observability is the only mechanism that turns those
failures into fixable defects, and it cannot be retrofitted cheaply. Here it carries a second
load: a wrong part number is indistinguishable from a right one at the counter, so tracing an
answer back to its tool calls is the only way to tell a data problem from a reasoning problem.

## Technology Constraints

### Language and repository

- **TypeScript across the entire repository** — web app, API, agent orchestration, and the
  MCP server. This supersedes §8 of the upstream spec, which specified Python 3. `strict`
  mode MUST be enabled; `any` requires an inline comment justifying it. Runtime is Node.js
  (current LTS or newer).
- **Monorepo**: web app, API, MCP server, data preparation pipeline, Terraform modules, and
  Docker assets all live here. One package manager, one lockfile, committed.
- **Shared contracts**: types shared across service boundaries MUST have a single definition.
  Duplicated hand-maintained type declarations are prohibited.

### Services and runtime

- **Five application services, one Docker Compose**: `web`, `api`, `mcp`, `otel-collector`,
  `keycloak`. Supporting infrastructure services join the same Compose file under the rule in
  Principle II; as of feature `001` these are the self-hosted telemetry backends (log store,
  Kibana, Grafana).
- **Image parity**: the image built for local development MUST be the same image deployed to
  Azure. Environment differences MUST be expressed as configuration, never as a separate
  build target or a divergent Dockerfile.
- **`docker compose up` MUST bring the full stack to a working state** with no manual steps
  beyond providing a `.env`. A change that breaks local bring-up is a broken change.

### Infrastructure

- **Terraform is the only provisioning mechanism.** Every Azure resource MUST be declared in
  Terraform. Portal click-ops and imperative CLI provisioning are prohibited; a resource that
  exists but is not in state is drift and MUST be reconciled or destroyed.
- Terraform state MUST be remote and locked. Secrets MUST NOT be committed to state inputs in
  the repository.
- Infrastructure changes MUST be reviewed as a `terraform plan` before apply.

### Identity

- **Keycloak is the identity provider.** Authentication is OIDC; the web app performs the
  login flow and the API validates tokens on every request. There is no unauthenticated path
  to catalog data.
- Authorization decisions MUST be made server-side. The frontend MAY hide UI based on roles;
  it MUST NOT be the enforcement point.
- The MCP server MUST NOT be reachable from the public internet — it is called by the API,
  never by the browser.

### Frontend

- **shadcn/ui on Tailwind CSS** is the component foundation. Components are vendored into the
  repository (shadcn's copy-in model), so they are ordinary reviewable source code.
- A second component library MUST NOT be introduced. Extending or restyling a vendored
  shadcn component is preferred over adding a dependency.
- Chat responses render structured tool results — part numbers, photos, kit tables — as
  components, not as model-formatted markdown blobs.

### Models and catalog access

- **Direct OpenAI API** via the official `openai` SDK. `OPENAI_API_KEY` and `OPENAI_MODEL`
  MUST come from environment configuration; Azure endpoint, deployment-name, API-version, and
  `api-key` header configuration MUST NOT be used. Keys MUST NOT appear in the repository.
- **The MCP server is the ONLY path from the application to the catalog.** It opens SQLite
  **read-only** (`mode=ro`) and MUST NOT write to the catalog database. No other component may
  query the catalog directly.
- **The catalog model MUST be source-agnostic.** Eaton is the first catalog, not the shape of
  the design. Parts, applications, kits, drawings, and cross-references MUST be scoped to the
  catalog they belong to; a part number is unique within its catalog, never globally. No
  manufacturer name may appear in the structure of the model, in identifiers, or in search
  behaviour. Source-format knowledge — the Jet4/SQLite layout, the free-text year strings, the
  case-insensitive photo filenames — belongs to an import layer and MUST NOT leak past it.
  Admitting a second catalog is an import, never a migration.
- **Tool contracts**: every MCP tool MUST declare an explicit input and output schema, and
  MUST validate its inputs at runtime.
- **Data preparation**: the pipeline producing derived artifacts (normalized year ranges,
  photo index, full-text indexes) MUST be idempotent and reproducible from
  `CatalogoExpresso.c01` without manual steps.
- **Binary artifacts**: `eaton_catalogo.sqlite` and the `FotoProd/` and `Figuras/` asset
  folders MUST NOT be committed to git. Their location MUST be resolved from environment
  configuration. The built canonical catalog and its assets are baked into the MCP image as a CI
  artifact — decided in feature `001`, research.md R4.

### Boundaries and configuration

- Data crossing a trust boundary — HTTP request bodies, query parameters, environment
  variables, model output, third-party API responses — MUST be validated at runtime, not
  merely typed. A TypeScript type is a compile-time claim, not a runtime guarantee, and model
  output is untrusted input.
- All configuration MUST come from the environment. Secrets MUST NOT be committed in any
  form, including test fixtures and example files.

## Development Workflow & Quality Gates

- **Artifact order**: `spec.md` → `plan.md` → `tasks.md` → implementation. Each gate is
  approval by the project owner.
- **Constitution Check**: every plan MUST pass the Constitution Check gate before Phase 0
  research and MUST be re-checked after Phase 1 design. Violations are either removed or
  justified in Complexity Tracking — there is no third option.
- **Grounding Gate**: every Eaton part number, vehicle application, price, and photo shown to
  the user MUST originate from an MCP tool result in that same conversation. The model MUST
  NOT synthesize, complete, or correct a part number from its own knowledge. When the catalog
  returns nothing or returns ambiguous candidates, the agent MUST say so or ask — it MUST NOT
  guess. Reviewers MUST verify this for any change touching prompts, tool schemas, or the
  answer-composition path.
- **Infrastructure Gate**: changes under Terraform are reviewed as a plan diff. An apply
  without a reviewed plan is prohibited.
- **Testing**: tests are not mandated per-feature by this constitution; TDD is available but
  not required. Where a spec calls for tests, those tests MUST exist and MUST pass before the
  work is called complete. By that rule the upstream spec already binds two suites: the
  ~10 golden end-to-end queries, and dedicated unit tests for the year parser — identified
  there as the highest-risk unit, since the source field is free Portuguese text
  (`Todos`, `2012/...`, `A partir 2005`, `Até 2016`). Committing a knowingly failing test
  without marking it as expected-to-fail is prohibited.
- **Performance**: each MCP tool call SHOULD complete in under 500 ms against the local
  indexed database, per the upstream spec's success criteria. Regressions past that budget
  MUST be justified in the plan.
- **Verification before completion**: work MUST NOT be reported as complete, fixed, or
  passing without having run the relevant checks and observed the output. Claims of success
  require evidence.
- **Review**: changes are reviewed against the spec they implement and against these three
  principles. "It works" is necessary and not sufficient.

## Governance

- This constitution supersedes all other development practices and conventions in this
  repository. Where a tool default, template, or habit conflicts with it, this document wins.
- **Amendment procedure**: amendments MUST be proposed as an edit to this file, MUST state
  the rationale, and MUST be approved by the project owner before taking effect. Any
  amendment that invalidates existing artifacts MUST name them and describe the migration.
- **Versioning policy**: semantic versioning applies to this document.
  - **MAJOR** — a principle is removed or redefined in a backward-incompatible way, or
    governance rules change such that previously compliant work becomes non-compliant.
  - **MINOR** — a principle or section is added, or existing guidance is materially expanded.
  - **PATCH** — clarifications, wording, and typo fixes that do not change what is required.
- **Compliance review**: the Constitution Check gate in every plan is the primary enforcement
  point. Reviewers MUST verify compliance before approving a plan or an implementation.
- **Runtime guidance**: `CLAUDE.md` and the active feature's `plan.md` provide day-to-day
  development guidance; `../eaton-scraping/GRAFO.md` is the reference for the catalog data
  model. None of them may contradict this constitution; if one does, this document governs
  and the other MUST be corrected.

**Version**: 1.3.1 | **Ratified**: 2026-08-10 | **Last Amended**: 2026-08-10
