# @backbone/core

The Blueprint schema — the deterministic intermediate representation between analysing a
frontend and generating a backend. Plain, serialisable data with pure helpers:

- `types.ts` — Blueprint, Entity, Endpoint, Relation, etc.
- `naming.ts` — deterministic pluralisation, snake/pascal/camel/kebab, table + join-table names.
- `blueprint.ts` — factory, canonicalisation (stable ordering), serialize/parse, validate.
- `diff.ts` — Blueprint-to-Blueprint change set for regeneration.
- `schema.ts` — draft-07 JSON Schema mirror for external editors.

No I/O, no AI. Equivalent Blueprints serialise byte-identically.
