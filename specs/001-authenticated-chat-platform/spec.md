# Feature Specification: Authenticated Parts Finder Chat Platform

**Feature Branch**: `001-authenticated-chat-platform`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Arquitetura modular em vertical slices com Clean Architecture e use cases, TypeScript, duas aplicações: (1) aplicação web em React + Next.js com shadcn/ui, (2) aplicação de APIs interna, acessível somente dentro da subnet privada do projeto. Autenticação e IAM via Keycloak. Adicionar container app de OpenTelemetry Collector enviando telemetria para Kibana e Grafana. Contexto do projeto: agente conversacional sobre o catálogo de peças Eaton, MCP server como único acesso ao catálogo Postgres, OpenAI API direta, infra em Terraform, Docker Compose com serviços de aplicação e infraestrutura."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find a part by conversation (Priority: P1)

A user at the distributor opens the platform, signs in with their corporate credentials, and
types the request in the same informal words it was given to them — *"embreagem pro Cargo 1723
2015"*. The agent understands the phrasing, identifies the vehicle, and answers with the part
number, the description, and the product photo when one exists.

**Why this priority**: This is the entire reason the platform exists. Without it there is no
product. A user who can get one correct part number from one informal sentence already has
something better than the legacy VB6 catalog, even with nothing else built.

**Independent Test**: Sign in, send a single informal part request in the chat, and confirm the
response contains a real part number that matches the same query run directly against the
catalog. Delivers value on its own: it replaces the manual lookup.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the chat screen, **When** they send
   "embreagem pro Cargo 1723 2015", **Then** the system responds with at least one part
   number, its description, and the photo if the catalog has one.
2. **Given** a request whose part exists but has no photo in the catalog, **When** the answer
   is composed, **Then** the part is still returned with its textual record and the absence of
   a photo does not produce an error or an empty answer.
3. **Given** a request matching both current and discontinued parts, **When** results are shown,
   **Then** current parts appear first and each discontinued part is marked as such.
4. **Given** a request whose only match is discontinued, **When** the answer is composed,
   **Then** the part is returned and identified as discontinued, rather than returned as though
   it were current or withheld entirely.
5. **Given** a request that matches no part in the catalog, **When** the answer is composed,
   **Then** the system states that nothing was found and offers to browse by product group,
   and does NOT return an invented part number.
6. **Given** an unauthenticated visitor, **When** they open any chat URL, **Then** they are
   sent to sign in and no catalog content is returned.

---

### User Story 2 - Disambiguate the vehicle instead of guessing (Priority: P2)

The user gives a vehicle description that matches several applications in the catalog — a model
name shared across years, or a year that falls into multiple free-text ranges. Rather than
picking one, the agent shows the candidate vehicles and asks which one, then continues the
search with the confirmed vehicle.

**Why this priority**: A wrong part number is worse than no part number — it sends someone to
fetch, order, or fit the wrong component, and the error surfaces late. Vehicle model and year
are free text in the source catalog, so ambiguity is the normal case, not the exception. This
story is what makes US1 safe to rely on.

**Independent Test**: Send a deliberately ambiguous vehicle request and confirm the system
returns a choice of candidate vehicles and waits, rather than answering with parts. Then pick
one and confirm the search proceeds with it.

**Acceptance Scenarios**:

1. **Given** a request whose vehicle matches more than one catalog application, **When** the
   agent replies, **Then** it presents the candidate vehicles with their manufacturer and
   original year text, and asks the user to choose.
2. **Given** the user chooses a candidate, **When** the search continues, **Then** parts
   are returned for that specific application only.
5. **Given** a user who cannot name the vehicle, **When** they ask which manufacturers or which
   models exist, **Then** the system lists values taken from the catalog and narrows step by
   step until a vehicle is fixed.
3. **Given** a requested year that matches no application exactly, **When** the agent replies,
   **Then** it widens to open-range and general-fit applications and states clearly that there
   was no exact year match.
4. **Given** a vehicle year expressed in the catalog as free Portuguese text (`Todos`,
   `2012/...`, `A partir 2005`, `Até 2016`, `2012/2014`), **When** the year filter is applied,
   **Then** the application is matched or excluded correctly according to that text.

---

### User Story 3 - See the whole assembly, not just the part (Priority: P3)

Having found the part, the user sees what it belongs to: the kit that contains it, its
components if the part is itself a kit, and the neighbouring parts from the same exploded
drawing.

**Why this priority**: A part is rarely needed alone. Someone asking for a single component
often needs the kit, or a neighbouring item from the same assembly, and the exploded drawing is
how that relationship is expressed in the source catalog. Surfacing it prevents a second lookup
and prevents identifying a component correctly but in isolation from what it fits into. This is
about completeness of the answer, not about selling more — the platform is a finder, not a
sales tool. It depends on US1 having found a part, so it comes after.

**Independent Test**: Look up a part known to belong to a kit and confirm the response includes
the parent kit and same-drawing parts, each with its own part number.

**Acceptance Scenarios**:

1. **Given** a part that is a component of one or more kits, **When** the answer is shown,
   **Then** the parent kits are listed with their part numbers and descriptions.
2. **Given** a part that is itself a kit, **When** the answer is shown, **Then** its components
   are listed with quantity and drawing item number.
3. **Given** a part with no kit relationship and no drawing, **When** the answer is shown,
   **Then** the answer is returned without suggestions and without an error.

---

### User Story 4 - Cross-reference a competitor part number (Priority: P4)

Someone arrives with a part number from another manufacturer. The user pastes it into the chat
and gets the equivalent catalogued part.

**Why this priority**: A distinct entry point into the catalog that needs no vehicle at all,
and the source data for it is already complete and clean. Valuable, but narrower than the
vehicle-driven flow.

**Independent Test**: Paste a known third-party number and confirm the equivalent catalogued
part is returned with the referenced manufacturer named.

**Acceptance Scenarios**:

1. **Given** a third-party part number present in the catalog's cross-references, **When** it is
   sent in the chat, **Then** the equivalent catalogued part is returned along with the
   third-party manufacturer name.
2. **Given** a number that resembles a part number but is absent from the cross-references,
   **When** it is sent, **Then** the system says it has no equivalent on record and does not
   substitute an approximate match.

---

### User Story 5 - Explain an answer after the fact (Priority: P5)

An operator or the product owner needs to understand why the platform answered what it
answered — after a user reports a suspicious part number, or while investigating a slow
response. They open the observability dashboards and reconstruct the conversation turn: which
catalog lookups ran, with which arguments, how many rows each returned, and how long each took.

**Why this priority**: The platform's credibility rests on being auditable. A wrong answer that
cannot be explained cannot be fixed. It is last because the preceding stories must exist before
there is anything to audit, but it is not optional.

**Independent Test**: Run a chat request, then locate that exact turn in the dashboards and
reconstruct the catalog lookups behind the answer without reading application source code.

**Acceptance Scenarios**:

1. **Given** a completed chat turn, **When** an operator searches the observability dashboards
   by conversation identifier, **Then** they find the turn with every catalog lookup it made,
   including arguments, result counts, and durations.
2. **Given** a chat turn that spans the web application, the internal API, and the catalog
   service, **When** the turn is inspected, **Then** it appears as one connected trace rather
   than as disconnected fragments.
3. **Given** a failed chat turn, **When** it is inspected, **Then** the failure point and its
   cause are identifiable from telemetry alone.
4. **Given** any telemetry record, **When** it is inspected, **Then** it contains no credentials
   and no personal data of the user beyond the identifier needed to correlate the session.

---

### Edge Cases

- **Ambiguous vehicle**: candidates are offered and the system waits; it never picks one.
- **No exact year match**: widen to open-range applications and say so explicitly.
- **Part not found**: offer navigation by product group rather than an empty answer.
- **Part without a photo**: the common case — roughly 7% of products have one. Textual record is
  returned; missing photo is never an error.
- **Photo filename case mismatch**: catalog filenames mix `.jpg` and `.JPG` against the asset
  folders; resolution must be case-insensitive and a mismatch must not break the answer.
- **Unreadable technical note**: product notes are stored as rich text; if conversion fails the
  note is omitted and the rest of the record is still returned.
- **Catalog service unavailable**: the agent states it cannot reach the catalog and returns no
  part data. It MUST NOT answer from the language model's own knowledge.
- **Session expires mid-conversation**: the user is prompted to sign in again. On return the
  conversation continues if the browser session still holds it; if it does not, the system
  states plainly that the conversation was reset rather than presenting an empty chat as if
  nothing had been said.
- **Access revoked while signed in**: an administrator revokes a user's access during an active
  session; the next request for catalog data is refused.
- **Term that exists in more than one catalog**: not reachable in the MVP, which loads only one
  catalog, but the data model MUST already scope a part number to its catalog so that the same
  number appearing in two catalogs is two distinct parts, not a collision.
- **Direct request to the internal API from outside the private network**: refused at the network
  boundary, before authentication is even evaluated.
- **Model returns a part number not present in any lookup result**: the answer is suppressed or
  corrected; a fabricated number MUST NOT reach the user.

## Requirements *(mandatory)*

### Functional Requirements

**Access and identity**

- **FR-001**: System MUST require every user to authenticate before any catalog content is
  returned; there is no anonymous access path.
- **FR-002**: System MUST authenticate users through the project's identity provider using a
  standard single sign-on flow, with no application-managed passwords.
- **FR-003**: System MUST validate the user's identity on the server for every request that
  reaches catalog data; interface-level hiding MUST NOT be the enforcement point.
- **FR-004**: System MUST expose exactly one publicly reachable surface — the web application.
  The internal API MUST be reachable only from within the project's private network.
- **FR-005**: System MUST end a session after expiry and require re-authentication.
- **FR-006**: System MUST recognise two roles — **user** (may converse and look up parts) and
  **administrator** (may additionally manage who has access). Every privileged operation MUST
  verify the caller's role on the server.
- **FR-007**: Administrators MUST be able to grant and revoke a person's access to the platform,
  and a revocation MUST take effect without waiting for the revoked user's session to expire
  naturally.

**Conversation and answers**

- **FR-008**: Users MUST be able to request a part in free-form Portuguese naming a vehicle, a
  year, and a part in a single sentence.
- **FR-009**: System MUST interpret vehicle year values stored as free Portuguese text and
  decide correctly whether a given year falls inside the stated range, treating unrecognised
  or open values as matching any year rather than excluding candidates.
- **FR-010**: System MUST ask the user to choose when a vehicle description matches more than
  one catalog application, and MUST NOT select one on the user's behalf.
- **FR-011**: System MUST return, for each identified part: part number, description, product
  group, and the product photo when the catalog holds one.
- **FR-012**: System MUST offer, for an identified part, the kits that contain it, its
  components when it is a kit, and parts sharing its exploded drawing.
- **FR-013**: Users MUST be able to submit a third-party part number and receive the equivalent
  catalogued part.
- **FR-014**: Every catalog fact presented to the user — part number, description, vehicle
  application, photo, kit membership, cross-reference — MUST originate from a catalog lookup
  performed during that conversation. System MUST NOT present catalog data derived from the
  language model's own knowledge.
- **FR-015**: System MUST state plainly when the catalog returns nothing, rather than offering
  an approximate or adjacent result as if it were a match.
- **FR-016**: System MUST preserve conversational context within a session so follow-up messages
  refer to the vehicle and part already established.
- **FR-017**: System MUST NOT retain conversation content after the session ends. Conversations
  are not recoverable by the user, by an administrator, or by support.
- **FR-031**: The web application MUST use the project's shadcn/ui design system for reusable
  interface controls and result-card primitives. Chat, authentication, notices, selectors, and
  catalog result cards MUST present a consistent visual and interaction language from that
  design system, with no second component kit introduced for equivalent controls.
- **FR-029**: Users MUST be able to narrow progressively when they cannot name the vehicle in
  one sentence — asking which manufacturers exist, then which models that manufacturer has, then
  which years. Each step MUST offer values that exist in the catalog, never values the system
  inferred. A user who already knows the vehicle MUST be able to skip straight to naming it;
  the narrowing path is available, not mandatory.
- **FR-030**: When the catalog marks a part as discontinued, the system MUST rank it below
  current parts in any list of results, and MUST identify it as discontinued wherever it is
  shown. Ranking alone is insufficient: a discontinued part that is the only match still appears
  first, and returning it unmarked would send someone after a component that is no longer
  supplied.

**Catalog access**

- **FR-018**: System MUST route all catalog reads through a single catalog service; no other
  component may query the catalog store directly.
- **FR-019**: System MUST treat the catalog as read-only; no user action may modify it.
- **FR-020**: System MUST derive its searchable artifacts — normalised year ranges, photo index,
  text search indexes — from the source catalog through a repeatable process that produces the
  same result on every run.

**Catalog independence**

- **FR-021**: System MUST represent catalog content independently of any single manufacturer's
  catalog. Parts, vehicle applications, kits, drawings, and cross-references MUST each be scoped
  to the catalog they came from, so that a part number is unique within its catalog rather than
  globally. No manufacturer name may be embedded in the structure of the data model, in
  identifiers, or in search behaviour.
- **FR-022**: Loading an additional catalog MUST require only a new import for that catalog's
  source format. It MUST NOT require changing the data model, the search behaviour, the
  conversation flow, or the catalog service's operations.

**Observability**

- **FR-023**: System MUST record every conversation turn as a single correlated unit of
  telemetry spanning the web application, the internal API, and the catalog service.
- **FR-024**: System MUST record, for every catalog lookup, the operation performed, its
  arguments, the number of results, and its duration.
- **FR-025**: System MUST deliver telemetry from every service to the project's own log search
  and metric dashboard tools, where it is searchable and inspectable by an operator.
- **FR-026**: System MUST exclude credentials, tokens, and personal data from all telemetry.
  Because conversation content is not retained (FR-017), telemetry MUST carry the shape of a
  turn — which lookups ran and what they returned — without becoming a backdoor archive of the
  conversation itself.

**Operability**

- **FR-027**: The complete platform, including its telemetry tooling, MUST be startable in a
  local environment with a single command and no manual steps beyond supplying configuration
  values.
- **FR-028**: All cloud resources MUST be created and changed through declarative
  infrastructure definitions held in the repository.

### Key Entities

- **Catalog**: a body of parts data from one source, with its own identifier scheme, its own
  assets, and its own import. Everything below belongs to exactly one catalog. The MVP loads a
  single catalog — Eaton — but nothing in the model may assume that.
- **User**: an authenticated person at the distributor. Has an identity, a session, and a role.
  Does not own catalog data.
- **Role**: what a signed-in person may do. Two exist — *user* (converse and look up parts) and
  *administrator* (the same, plus granting and revoking access).
- **Conversation**: an exchange between one user and the agent, composed of ordered turns.
  Carries the established context — the vehicle and part under discussion. Lives only for the
  duration of the session and is not stored afterwards.
- **Turn**: one user message and the answer produced for it, together with the catalog lookups
  performed. The unit of auditing.
- **Part**: a catalog item, identified by its part number within its catalog, belonging to a
  product group and optionally a subgroup, optionally carrying a photo and a technical note.
- **Vehicle Application**: a vehicle the catalog recognises, described in free text, attributed
  to a manufacturer, and qualified by a free-text year range. The bridge between the vehicle as
  someone describes it and the parts that fit it.
- **Manufacturer**: the vehicle maker (Mercedes-Benz, Ford, VW, Iveco, Scania, Agrale…), and
  separately the third-party maker named on a cross-reference. In the Eaton catalog every part
  belongs to the catalog's own brand and carries no manufacturer of its own — a property of
  that catalog, not a rule the model may assume.
- **Kit**: a part composed of other parts, with quantity and drawing position per component.
- **Exploded Drawing**: a technical illustration with numbered items, linking neighbouring parts
  of the same assembly. The link from a drawing item to a part is textual, not a direct
  reference.
- **Cross-Reference**: an equivalence between a third-party part number and a catalogued part.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user goes from an informal spoken request to a confirmed part number in under
  60 seconds without leaving the chat.
- **SC-002**: 95% of part requests return their first substantive answer within 5 seconds.
- **SC-003**: Across a controlled reference set of at least 100 conversations, zero part numbers
  appear in an answer that were not returned by a catalog lookup in that same conversation.
  (Measured on a test corpus rather than production traffic, because conversation content is
  not retained — see FR-017.)
- **SC-004**: In 100% of the reference test cases with an ambiguous vehicle, the system asks
  instead of answering.
- **SC-005**: An operator can reconstruct the catalog lookups behind any given answer in under
  5 minutes, using dashboards alone.
- **SC-006**: Zero catalog content is retrievable without a valid authenticated session,
  verified by attempting unauthenticated access to every published entry point.
- **SC-007**: Zero successful requests to the internal API originate from outside the private
  network, verified by attempted access from a public network.
- **SC-008**: A new developer brings the full platform up locally and completes a successful
  chat lookup within 30 minutes of cloning the repository.
- **SC-009**: 90% of users complete a part lookup successfully on their first attempt without
  training beyond a one-page guide.
- **SC-010**: Access revoked by an administrator stops working within 5 minutes, verified by
  revoking a live session and retrying a catalog request.
- **SC-011**: After a session ends, no conversation content is retrievable from any system the
  organisation operates, verified by searching every store and dashboard for a known phrase
  used during a test conversation.
- **SC-012**: A second catalog, supplied as a small fixture in a different source format, can be
  loaded and searched through the same conversation flow with no change to the data model and no
  change to the catalog service's operations — only its own import. This is the acceptance test
  for catalog independence, and it is run even though the MVP ships with one catalog.
- **SC-013**: A user who starts knowing only the manufacturer reaches a specific vehicle in no
  more than three narrowing exchanges.
- **SC-014**: Across the reference test set, no discontinued part is ever presented without being
  identified as discontinued, and no discontinued part outranks a current part that matches the
  same request.

## Assumptions

**Purpose and scope, as directed by the project owner (2026-08-10)**:

- The platform is a **finder**: it locates parts and shows the kits and assemblies they belong
  to. It is **not a sales tool**. It does not pursue basket value, does not present suggestions
  as commercial offers, and does not treat a completed lookup as a sale. Where the upstream
  spec of 2026-08-06 framed suggestions as *upsell*, this feature supersedes that framing —
  the same catalog relationships are surfaced, for completeness of the answer rather than for
  revenue.
- The **MVP loads the Eaton catalog only**. No second catalog is imported for this release.
- The **data model must nonetheless be catalog-agnostic** (FR-021, FR-022, SC-012). Eaton is
  the first catalog, not the shape of the design. Anything that would have to be rewritten to
  admit a second catalog belongs in the import layer, never in the model, the search, or the
  conversation flow.

**Inherited from the project constitution and the upstream design** (not decisions of this
spec; recorded here because they bound the solution space):

- The MVP's single catalog source is `eaton_catalogo.sqlite`, already extracted from
  `CatalogoExpresso.c01`, with its `FotoProd/` and `Figuras/` asset folders. Its structure and
  validated relationships are documented in `../eaton-scraping/GRAFO.md`. That structure is an
  *input format* to be imported, not the platform's own model — see FR-021.
- The database used by the platform is Postgres. The SQLite file named above is only the legacy
  Eaton input artifact consumed by the migration/import package.
- Catalog access is exclusively through MCP tools; the tool surface, year-parsing rules,
  suggestion logic, and edge cases come from the upstream design spec dated 2026-08-06, which
  this feature supersedes on six points: it is hosted rather than local, web rather than Claude
  Desktop, authenticated rather than open, TypeScript rather than Python, catalog-agnostic
  rather than Eaton-shaped, and a finder rather than an upsell tool.
- Roughly 788 of 11,725 products carry a photo. Missing photos are the normal case.
- Language and stack are fixed by the constitution: TypeScript throughout, React and Next.js
  with shadcn/ui for the web application, the direct OpenAI API for reasoning, Terraform for all
  provisioning, and a Docker Compose environment that brings up the whole platform.

**Architectural directives given with this request** (to be realised in `plan.md`, not decided
here):

- Modular architecture organised in vertical slices, each slice owning its own use cases under
  Clean Architecture layering.
- Two applications: a public web application, and an API application reachable only inside the
  project's private subnet.
- Keycloak as the identity and access management provider.
- An OpenTelemetry Collector service receiving telemetry from all services and exporting it to
  Kibana and Grafana, both self-hosted alongside the platform.

**Reasonable defaults adopted where the description was silent**:

- Users are internal distributor staff on managed devices with reliable connectivity; no public
  or customer-facing access is in scope.
- The interface is Portuguese (pt-BR). The catalog's Spanish and English columns exist but are
  not surfaced in this feature.
- Desktop browser is the primary target; the workstation is fixed. Mobile layout is not a goal
  of this feature.
- Real-time pricing, stock levels, and ERP integration remain out of scope, as in the upstream
  spec — and are further out of scope now that the platform is explicitly not a sales tool.
- One conversation at a time per user; no sharing or handover of conversations.
- Administration of users and access is delegated to the identity provider's own console. This
  feature does not build an in-application administration screen; the *administrator* role
  governs who may reach that console and any privileged platform operation.

**Decisions taken during clarification (2026-08-10)**:

- **Observability tooling is self-hosted in full.** The log store, the log search interface, and
  the metric dashboards run as services of this project in every environment, local and cloud,
  not as managed or pre-existing instances. The collector exports to them directly.
  - *Consequence*: the platform's service count rises above the five application services the
    constitution enumerates. This was raised at decision time and accepted deliberately;
    the constitution has been amended to separate application services from supporting
    infrastructure services, and `plan.md` MUST carry the operational cost — storage sizing,
    retention, backup, and upgrade of the log store — as an explicit Complexity Tracking entry.
- **Conversation history is not persisted.** Conversations exist for the life of the session and
  are then gone. No conversation datastore is introduced by this feature. Consequences: no
  reopening of past conversations, no support-side conversation recovery, and auditing (User
  Story 5) rests on telemetry about lookups rather than on stored conversation text.
- **Two roles: user and administrator.** *User* is the person doing lookups. *Administrator*
  adds the ability to grant and revoke access. No reporting or supervisory role exists in this
  feature, and therefore no requirement to view another person's conversations — which is
  consistent with not retaining them.
