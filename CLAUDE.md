<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

**Active feature**: `specs/001-authenticated-chat-platform/`

- [plan.md](specs/001-authenticated-chat-platform/plan.md) — stack, structure, Constitution Check
- [spec.md](specs/001-authenticated-chat-platform/spec.md) — FR-001…FR-028, SC-001…SC-012
- [research.md](specs/001-authenticated-chat-platform/research.md) — decisions and why
- [data-model.md](specs/001-authenticated-chat-platform/data-model.md) — canonical catalog schema
- [data-migration.md](specs/001-authenticated-chat-platform/data-migration.md) — Eaton → canonical mapping, measured against the real database
- [contracts/](specs/001-authenticated-chat-platform/contracts/) — MCP tools, web ↔ API
- [quickstart.md](specs/001-authenticated-chat-platform/quickstart.md) — bring-up and validation

Governance: [.specify/memory/constitution.md](.specify/memory/constitution.md) (v1.3.0).

Three rules that override any convenient shortcut:

1. **Grounding.** No catalog fact reaches the user unless a tool call produced it. The model
   emits prose and `[[card:N]]` references; it never types a part number.
2. **Catalog-agnostic.** Eaton-specific knowledge lives only in
   `packages/catalog-import/adapters/eaton/`. Nothing downstream may know the source format.
3. **One catalog path.** Only `apps/mcp` reads the catalog, read-only. Only `apps/web` is
   publicly reachable.
<!-- SPECKIT END -->
