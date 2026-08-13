# Phase 0 — Research & Decisions

**Feature**: Authenticated Parts Finder Chat Platform
**Date**: 2026-08-10
**Status**: All unknowns resolved. No `NEEDS CLARIFICATION` remains in the Technical Context.

---

## R1. Enforcing grounding mechanically rather than by prompt

**Decision**: The model may not emit catalog identifiers. Every tool call appends its results to
a per-turn **grounding ledger** as numbered cards. The model composes prose containing card
references (`[[card:3]]`) only. The API resolves references against the ledger, and an
**answer validator** scans the prose for anything shaped like a catalog identifier before the
turn is released. A hit that is not a resolved reference fails the turn: it is logged as a
grounding violation, and the user is shown the cards without the offending prose rather than a
plausible-looking wrong answer.

**Rationale**: FR-014 and the constitution's Grounding Gate demand that no part number reaches
the user unless a lookup produced it. A system prompt asking the model to behave cannot deliver
that — it fails silently and exactly when it matters, since a fabricated part number is
syntactically indistinguishable from a real one. Making identifiers structurally unavailable to
the model removes the failure mode instead of discouraging it. It also satisfies the
constitution's frontend rule that tool results render as components rather than
model-formatted markdown.

**Alternatives considered**:
- *Prompt instruction plus review* — rejected: unverifiable, and SC-003 requires measuring zero
  ungrounded numbers across 100 conversations, which a prompt cannot support.
- *Post-hoc regex check against the ledger, model still writes numbers* — rejected as the sole
  mechanism, but **kept as the validator's second layer**, because a model can still emit a
  number in prose despite the card protocol. Belt and braces: the protocol makes it rare, the
  validator makes it detectable.
- *Constrained decoding / structured output for the whole answer* — rejected: it flattens the
  conversational tone the spec's informal-Portuguese scenarios depend on. Cards carry the facts;
  prose stays free but fact-free.

---

## R2. Keeping exactly one publicly reachable surface while using OIDC

**Decision**: Keycloak keeps **internal ingress only**. The Next.js application reverse-proxies
`/auth/*` to it from the server side, so the browser only ever talks to the web application's
origin. Keycloak is configured with `KC_HOSTNAME` set to that public origin and
`KC_PROXY_HEADERS=xforwarded` so issued tokens and redirects carry the externally valid URLs.

**Rationale**: FR-004 says exactly one publicly reachable surface. OIDC Authorization Code flow
needs the *browser* to reach the identity provider — the naive reading of "Keycloak is
internal" and the naive reading of "standard OIDC" contradict each other, and this is the point
where the requirement actually bites. Proxying resolves it without weakening either: one public
origin, one public ingress, and a fully standard auth code flow with PKCE behind it.

**Alternatives considered**:
- *Give Keycloak its own public ingress* — rejected: it is a second public surface, so it fails
  FR-004 and SC-006's verification, which tests every published entry point.
- *Azure Front Door or Application Gateway doing path-based routing* — a legitimate way to get
  the same result, rejected for this scale: it adds a provisioned component and a second place
  where routing lives, for a tool with tens of internal users.
- *Resource Owner Password Credentials grant (app collects the password)* — rejected: deprecated
  in OAuth 2.1, and it violates FR-002's "no application-managed passwords".

**Risk to carry into implementation**: Keycloak hostname misconfiguration behind a proxy is the
classic failure here — it surfaces as redirect loops or as tokens issued with an internal
issuer that then fail validation. This deserves an explicit integration test asserting that the
issuer in a freshly minted token equals the public origin.

---

## R3. Catalog-agnostic model — how far the abstraction goes

**Decision**: Agnostic **all the way to the tool surface**. The MCP tools speak in catalog-neutral
terms (`part`, `vehicle_application`, `assembly`, `cross_reference`), the canonical database has
a catalog-neutral schema with every row scoped by `catalog_id`, and *all* Eaton-specific
knowledge lives in `packages/catalog-import/adapters/eaton/`: the Jet4/MDB layout, the
free-text Portuguese year strings, the case-insensitive photo filenames, the RTF technical
notes, and the textual drawing-item-to-component linkage. Import writes a canonical Postgres
database; the MCP server never sees the source format.

**Rationale**: FR-021 forbids manufacturer names in the structure of the model, identifiers, or
search behaviour; FR-022 requires that a second catalog need only a new import. If the tools
themselves knew about Eaton, FR-022 would be false — adding a catalog would mean changing the
tool surface.

**Confirmed by the project owner, 2026-08-10.** The alternative reading was put to them —
agnostic *storage schema only*, with tools still Eaton-aware, which would have been meaningfully
less work. They chose the broad reading and asked that the fixture be kept. So this is settled:
the abstraction reaches the tool surface, and SC-012 stays an end-to-end test rather than a
schema assertion.

That choice is what keeps FR-022 true rather than aspirational. Under the narrow reading,
"loading an additional catalog requires only a new import" would have been false the moment a
second catalog needed a tool to behave differently — and nothing would have caught it, because
nothing would have exercised a second catalog. The fixture is the mechanism that turns catalog
independence from a design intention into a property that breaks the build when violated.

**Alternatives considered**:
- *Derive views inside the source SQLite, as the upstream spec proposed* — rejected: it makes the
  Eaton schema the platform's schema, which is precisely what FR-021 forbids.
- *A general ETL framework* — rejected under YAGNI. Two adapters, one interface.

---

## R4. Where the catalog and its assets live at runtime

**Decision**: The import pipeline loads the canonical catalog into Postgres (`catalog-db`) and
produces a normalised asset tree. At runtime the MCP server is the only service that reads the
catalog database. Photos reach the browser through an authenticated passthrough endpoint on the
API, never directly from the MCP server.

This resolves the constitution's `TODO(DATA_HOSTING)`.

**Rationale**: The catalog is a static artifact from a 2021–2023 era desktop product; it changes
when a new catalog release is imported, not continuously. Baking it makes the image immutable
and self-contained, removes volume mounting and its failure modes, and gives an exact
correspondence between a deployed image and the catalog data it serves — which matters for
US5's auditability. The photo passthrough is what keeps FR-004 and FR-018 simultaneously true:
the browser needs images, and the MCP server must stay unreachable from the browser.

**Cost accepted**: an image on the order of a few hundred megabytes, and a rebuild-and-redeploy
to publish a catalog update. Both are acceptable at this cadence.

**Alternatives considered**:
- *Azure Files share mounted into the container* — rejected: a mutable shared volume, an extra
  provisioned resource, and drift between what is deployed and what is mounted.
- *Blob storage with the assets served via SAS URLs* — rejected: it puts a second publicly
  reachable data path next to the web app, against FR-004.
- *Keep SQLite as the runtime catalog* — rejected by owner direction on 2026-08-11: the database
  used by the platform must be Postgres.

---

## R5. Telemetry topology, and the line between telemetry and a conversation archive

**Decision**: All three services export OTLP to the collector, and the collector is the only
component that knows where telemetry goes. It writes traces, logs, and metrics to
**Elasticsearch**. **Kibana** serves trace and log inspection; **Grafana** reads the same
Elasticsearch for dashboards. Prometheus is not deployed.

**On the FR-024 versus FR-017 tension**: FR-024 requires recording each lookup's arguments, and
lookup arguments contain the user's own search terms — which is conversation content that FR-017
forbids retaining and SC-011 verifies is gone. The line is drawn as follows, and this is a
requirement on implementation, not a note:

- Tool-call spans record the **normalised, structured** arguments a lookup actually ran with —
  the resolved vehicle application id, the parsed year bounds, the product group — plus result
  counts and durations.
- The user's **raw utterance** and the model's prose are never attached to a span, a log line, or
  an attribute.
- The search term reaching `part_search` is the one user-derived string that must be recorded to
  make SC-005 possible. It is recorded, and it is the *only* such field.
- Telemetry retention is **30 days**, after which SC-011's guarantee holds unconditionally for
  anything older.

**Rationale**: An operator answering "why did it say that?" needs the shape of the turn, not its
transcript. Recording resolved arguments rather than raw text gives strictly more diagnostic
value — a resolved application id explains an answer better than the sentence that produced it —
while keeping the store from becoming the conversation archive FR-017 rules out.

**Alternatives considered**:
- *Prometheus for metrics, Elasticsearch for logs and traces* — rejected: a fifth supporting
  service for dashboards that Grafana can already draw from Elasticsearch.
- *Managed Azure Monitor and Azure Managed Grafana* — offered to the project owner and declined
  in favour of full self-hosting.
- *Recording raw utterances for debugging quality* — rejected: it directly contradicts FR-017.

---

## R6. Year parsing — the highest-risk unit

**Decision**: Parsing happens **once, at import**, in `packages/catalog-import/adapters/eaton/`,
as a pure function `parseYearRange(text) → { from: number | null, to: number | null }` writing
integer bounds into the canonical schema. The original string is preserved alongside for display
and audit. Null on either side means open. Unrecognised input yields fully open bounds — never
an exclusion.

Rules, from the observed data: extract all `(19|20)\d\d` groups, then — `Todos` / `-` / empty /
no digits → open; contains *até* with a year → `(null, YYYY)`; *a partir* / *em diante* / `YYYY/`
/ `YYYY/...` → `(YYYY, null)`; two years → `(min, max)`.

**Rationale**: The source field is free Portuguese text and only ~6.8k of 11.6k applications have
one at all. It is named in the upstream spec as the highest-risk unit and it is where a silent
wrong answer is most likely to originate. Parsing at import makes it deterministic, testable in
isolation, and cheap at query time; parsing at query time would make every search depend on it
and put string handling inside the 500 ms budget.

**Failing open is deliberate**: a parser that excludes on doubt hides valid parts, and the user
never learns what they did not see. A parser that includes on doubt produces a candidate the
user can reject — and US2's disambiguation already exists to handle exactly that.

**Alternatives considered**:
- *Ask the model to interpret the year text* — rejected: non-deterministic, unauditable, and it
  puts a catalog fact back in the model's hands, against the Grounding Gate.
- *Fail closed on unrecognised input* — rejected for the reason above.

---

## R7. Agent orchestration and the OpenAI API call

**Decision**: The API owns the agent loop. Per turn: build messages from in-memory session state
→ call the direct OpenAI API with the MCP tools exposed as function definitions → execute requested tool
calls against the MCP server over an internal transport → append results to the ledger → call
again with results → compose → validate → release. The loop is capped at **4 tool-call rounds**
per turn; exceeding it returns what the ledger holds with an explicit note rather than looping.
The OpenAI API key and model id come from environment configuration.

**Rationale**: Orchestration must live where the ledger lives, and the ledger must live behind
authentication, on the server. Putting the loop in the web app would either expose model
credentials to the public surface or require the browser to reach the MCP server — both
forbidden.

**Alternatives considered**:
- *Model-side MCP connection (the model service calling the MCP server directly)* — rejected: the
  MCP server has no public ingress by design, and the ledger would have no observation point.
- *Uncapped agentic loop* — rejected: unbounded latency against SC-002 and unbounded cost.

---

## R8. Session and turn state without a conversation store

**Decision**: Session state is held **in the API's memory**, keyed by the session identifier,
holding the established context (resolved vehicle, current part) and the ledger. It expires with
the session and on process restart. The web application holds the visible transcript in the
browser session only. Neither is written to disk.

**Consequence, accepted**: an API restart drops in-flight conversations. Users see the "the
conversation was reset" message the spec's session edge case already requires. With a single-user
-per-session internal tool and no persistence requirement, this is the honest cost of FR-017
rather than a defect.

**Alternatives considered**:
- *Redis for session state* — rejected: a tenth service and a datastore holding conversation
  content, which is what FR-017 forbids in substance even if it is only cached.
- *Encrypted client-side state* — rejected: the ledger is the grounding authority and must not be
  round-tripped through the client, where it becomes forgeable.

---

## R9. Test strategy

**Decision**: The constitution does not mandate TDD, but three suites are bound because the spec
calls for them, and one more is added because the design's central claim needs it.

| Suite | Binds to | Why it exists |
|---|---|---|
| Year-parser table | Upstream spec §8, R6 | The highest-risk unit; a pure function, so a table test is complete |
| ~10 golden queries | Upstream spec §8 | End-to-end truth: informal sentence in, known part number out |
| Second-catalog fixture | SC-012 | Catalog independence is a claim until a second catalog proves it |
| Grounding-violation test | FR-014, SC-003 | Feed the model a prompt engineered to elicit a fabricated number; assert the validator catches it |

**Rationale on the last one**: R1 claims the pipeline makes fabrication structurally impossible.
A claim like that must have a test that would fail if it were false — otherwise it is an
assertion about code that nobody has tried to break.

---

## R10. Local environment parity

**Decision**: One `docker compose up` brings all nine services: `web`, `api`, `mcp`,
`otel-collector`, `keycloak`, `keycloak-db`, `elasticsearch`, `kibana`, `grafana`. Keycloak
imports a realm definition from a versioned JSON file at start, so roles and a test user exist
without manual console steps. The MCP image is built from the same Dockerfile used in Azure, with
the canonical catalog produced locally by `nexo-import` when absent.

This resolves the constitution's `TODO(KEYCLOAK_PERSISTENCE)`: PostgreSQL, with realm
configuration versioned as a JSON export in the repository and imported at startup.

**Rationale**: FR-027 requires single-command bring-up including telemetry, and SC-008 gives a new
developer 30 minutes to a working lookup. Realm-as-a-file is what keeps identity configuration
from becoming click-ops in a project whose constitution forbids exactly that.

**Alternatives considered**:
- *Keycloak dev mode with an in-memory store* — rejected: state loss on restart breaks FR-007's
  revocation guarantee, and it diverges from the production image.
- *A lighter local identity stub* — rejected: it breaks image parity and would leave the OIDC
  proxy path (R2, the riskiest integration) untested locally.
