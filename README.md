# nexo

An authenticated parts finder: a user signs in, describes a vehicle and a part in informal
Portuguese — *"embreagem pro Cargo 1723 2015"* — and the agent answers with a grounded part
number, its photo, and the assemblies it belongs to.

The language model never types a part number. Every catalog fact reaches the screen as a
structured card produced by an MCP tool call and recorded in a per-turn ledger; the prose may
only reference cards by id (`[[card:1]]`), and a validator rejects any answer whose prose
contains a catalog identifier that is not in the ledger.

## The three rules

Everything else in this repository is negotiable. These are not:

1. **Grounding.** No catalog fact reaches the user unless a tool call produced it. A fabricated
   part number reaching the screen is a release blocker, not a defect to file.
2. **Catalog-agnostic.** Eaton-specific knowledge — the Jet4 layout, Portuguese year strings,
   photo-filename casing, RTF descriptions — lives only in
   `packages/catalog-import/adapters/eaton/`. Nothing downstream may know the source format.
   Adding a second catalog is a new importer, not a runtime change.
3. **One catalog path.** Only `apps/mcp` reads the catalog, read-only. Only `apps/web` is
   publicly reachable.

Governance: [.specify/memory/constitution.md](.specify/memory/constitution.md).

## Architecture

```
browser ──▶ web (Next.js 15)  ──▶ api (Fastify)  ──▶ mcp  ──▶ catalog-db (Postgres, read-only)
              │  public surface       internal          │  the only catalog path
              │                          │              │
              └── /auth/* proxy ──▶ keycloak            └── OpenAI API (prose only, no facts)
                                                                    │
                        all three services ── OTLP ──▶ otel-collector ──▶ elasticsearch ──▶ kibana / grafana
```

- **`apps/web`** — Next.js 15 + React 19 + shadcn/ui. The only publicly reachable surface. It
  reverse-proxies Keycloak under its own origin (`/auth/*`) so identity does not need public
  ingress of its own, and calls the API server-side through `/api/bff`.
- **`apps/api`** — Fastify. Validates the JWT per request, runs the agent turn, keeps the
  grounding ledger, validates the composed answer, and passes authenticated asset requests
  through. Publishes no host port.
- **`apps/mcp`** — the single catalog path. Eight tools over the canonical Postgres catalog:
  `search_parts`, `get_part`, `list_groups`, `get_assemblies`, `find_cross_reference`,
  `resolve_vehicle`, `list_manufacturers`, `list_vehicle_models`.
- **`packages/catalog-core`** — catalog-agnostic entities and repository ports.
- **`packages/catalog-import`** — the quarantine for source-format knowledge, plus the canonical
  Postgres schema, search indexes, and the `nexo-import` CLI.
- **`packages/contracts`** — zod schemas for tool I/O, API DTOs, and card shapes, shared by both
  sides of every boundary.
- **`packages/telemetry`** — shared OpenTelemetry bootstrap. Services talk to the collector only.

Vertical slices are the primary axis, with Clean Architecture layering *inside* each slice: a
slice owns its `domain/`, `application/`, and `infrastructure/`; dependencies point inward;
`composition/` is the only place adapters meet use cases. Slices were cut along user stories, so
`part-search`, `vehicle-resolution`, `assemblies`, and `cross-reference` map one-to-one onto them.

**No conversations are stored.** Turn state lives in server memory for the life of the session.
Telemetry records normalised tool arguments, result counts, and latency — never the raw utterance
and never the prose.

## Getting started

**Prerequisites**: Docker with Compose v2, Node.js 22 LTS, pnpm 9. The Eaton source artifacts are
deliberately **not** in this repository — point `EATON_SOURCE_DIR` at a checkout containing
`eaton_catalogo.sqlite`, `FotoProd/`, and `Figuras/`. You also need an OpenAI API key.

```bash
pnpm install
cp .env.example .env       # fill EATON_SOURCE_DIR and OPENAI_API_KEY; the rest has local defaults

# build the canonical catalog once, and again only when the source changes
pnpm nexo-import eaton --source "$EATON_SOURCE_DIR" --out "$CATALOG_DATABASE_URL"

docker compose -f infra/compose/docker-compose.yml up
```

Web at <http://localhost:3000> · Kibana at `:5601` · Grafana at `:3001` · catalog Postgres at
`:5432`. Keycloak, the API, and the MCP server publish **no** host port — reaching them any other
way than through the web app would contradict the single-public-surface design.

The import prints rows per entity and a count of year strings that parsed to open bounds. A
non-trivial open-bounds count is normal (~4.8k of ~11.6k applications carry no year text at all);
a count near zero means the year parser is over-matching.

[quickstart.md](specs/001-authenticated-chat-platform/quickstart.md) carries the full bring-up,
twelve numbered validation scenarios, and a troubleshooting table.

## Tests

```bash
pnpm test:unit       # year parser table and query extraction — the highest-risk units
pnpm test:contract   # MCP tools, the agent loop, and the grounding validator
pnpm test:golden     # reference queries with known expected part numbers (needs a built catalog)
pnpm test:e2e        # Playwright, authenticated path — suite not written yet

pnpm typecheck && pnpm lint
```

`test:golden` skips loudly, not silently, without `CATALOG_DATABASE_URL` pointing at a built
catalog. CI runs typecheck, lint, unit, and contract on every push and pull request.

## Documentation

The specification is the source of truth; this README summarises it.

| Document | What it settles |
|---|---|
| [spec.md](specs/001-authenticated-chat-platform/spec.md) | User stories, FR-001…FR-031, SC-001…SC-014 |
| [plan.md](specs/001-authenticated-chat-platform/plan.md) | Stack, structure, Constitution Check, complexity cost |
| [research.md](specs/001-authenticated-chat-platform/research.md) | The decisions and why the alternatives lost |
| [data-model.md](specs/001-authenticated-chat-platform/data-model.md) | Canonical catalog schema |
| [data-migration.md](specs/001-authenticated-chat-platform/data-migration.md) | Eaton → canonical mapping, measured against the real database |
| [contracts/](specs/001-authenticated-chat-platform/contracts/) | MCP tool surface and the web ↔ API contract |
| [quickstart.md](specs/001-authenticated-chat-platform/quickstart.md) | Bring-up and validation scenarios |

## Deployment

The target is Azure Container Apps in a VNet-integrated environment, provisioned entirely by
Terraform under `infra/terraform` — no portal steps in any runbook. **That module is not written
yet**; today the platform runs from `infra/compose`, with one Dockerfile per service in
`infra/docker`. Local and Azure are meant to differ only by environment: the web app is the only
surface with external ingress, everything else internal.
