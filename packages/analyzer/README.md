# @backbone/analyzer

Deterministic static analysis of a React+TS frontend into a Blueprint, via `ts-morph`.
Syntactic only — no type-checking of `node_modules`, no AI.

- `typemap.ts` — TS type node -> Blueprint primitive (enums from string-literal unions,
  Date -> datetime, float/int heuristic, cross-type references).
- `entities.ts` — collect exported interfaces/type-aliases; draft raw fields.
- `relations.ts` — many-to-one / one-to-many / many-to-many inference + FK typing.
- `endpoints.ts` — fetch / axios / typed-client call detection; method + URL -> path + CRUD.
- `manifest.ts` — optional `backbone.manifest.(ts|json)` overrides.
- `analyze.ts` — orchestrator: entity set, endpoint association, auth + datastore inference.
