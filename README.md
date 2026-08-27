# Backbone

**Build your frontend first. Derive the backend from it — deterministically, with no AI.**

Backbone reads a React + TypeScript frontend, extracts an editable **Blueprint** of the
backend it implies, and generates a complete, runnable backend project from that Blueprint.
Analysis and generation are **deterministic**: they are driven by static analysis (the
TypeScript compiler via `ts-morph`) plus fixed rules and code templates — **no model
inference at analyze or generate time**. Equivalent frontends always produce the same
backend.

```
analyze  →  Blueprint (review / edit)  →  generate  →  regenerate (additive)
```

- **Deterministic, not generative.** Same frontend in → same backend out, byte for byte.
- **Two runtimes.** Node.js (Express + TypeScript + Knex) and PHP (PDO), each in a
  standardized layered structure, SQLite out of the box (MySQL configurable).
- **Traceable.** Every Blueprint node records the frontend `file:line` it came from; a
  `GENERATION_REPORT.md` maps each requirement to the backend component it produced.
- **Additive regeneration.** Change the frontend, regenerate: Backbone diffs the Blueprint,
  writes new timestamped migrations (never editing old ones), overwrites only the generated
  boundary, and never touches your own code.

---

## Quickstart

Requirements: Node 20+, pnpm. (PHP 8.1+ and Composer only to run a generated PHP backend.)

```bash
pnpm install
pnpm build            # build the workspace packages
```

### The web UI (start here)

```bash
pnpm --filter @backbone/web dev
```

Open the printed URL, point it at `examples/demo-frontend`, and step through the pipeline:
see the Blueprint as an ERD of drafting cards with relation connectors, toggle entities /
fields / endpoints, follow source-ref links back into the frontend, pick a runtime +
architecture, generate, and read the report. Regenerate to see the change set.

### The CLI

```bash
# Analyse a frontend into a Blueprint (and print a traceable summary)
pnpm bb analyze examples/demo-frontend --out blueprint.json

# Review a saved Blueprint
pnpm bb review blueprint.json

# Generate a backend
pnpm bb generate examples/demo-frontend --runtime node --arch layered --out ./backend-node
pnpm bb generate examples/demo-frontend --runtime php  --arch layered --out ./backend-php

# Regenerate additively after the frontend changes
pnpm bb regenerate --out ./backend-node --frontend examples/demo-frontend

# List the available template sets
pnpm bb presets
```

Run a generated Node backend:

```bash
cd backend-node && npm install && cp .env.example .env && npm run migrate && npm run dev
```

---

## What gets detected

From `src/**/*.ts|tsx`, using fixed rules:

| Concept | Rule |
|---|---|
| **Entity** | an exported `interface`/`type` that is under `models/`·`types/`·`entities/`, is annotated `/** @entity */`, or is used as an API call's request/response payload |
| **Field** | name, nullability (`?` / `\| null`), TS type → primitive (`string`, `int`/`float`, `boolean`, `Date→datetime`, string-literal union → `enum`) |
| **Relation** | entity-typed field → many-to-one (FK); `Entity[]` → one-to-many; `<name>Id` → FK; arrays on both sides → many-to-many via a join table |
| **Endpoint** | `fetch`, `axios.<method>`, or a typed client `api.get/post/…`; HTTP method + URL → path pattern (`:id`) → CRUD, associated to an entity by payload type or path segment |
| **Auth** | a login/register call or bearer-token usage; token-bearing endpoints are marked protected |
| **Datastore** | inferred only when a persisted operation exists |

Only endpoints actually present in the frontend are generated. An optional
`backbone.manifest.(ts|json)` in the frontend root can override or augment what is detected.

---

## Generated backend

Both runtimes emit a complete, runnable project. Everything under the generated boundary
(`src/generated/` for Node, `app/Generated/` for PHP) is **owned by Backbone** and
overwritten on every regenerate; the thin entrypoint and project config outside it are
written **once** and never touched again. Migrations are additive.

- **Node · layered / modular** — Express + TypeScript, Knex migrations, zod validation,
  centralized error middleware, JWT auth (`/auth/register|login|me` + role guard + `users`),
  SQLite default. `layered` groups by kind; `modular` groups by feature.
- **PHP · layered** — PDO, per-entity validators, consistent JSON errors with correct status
  codes, JWT auth (`firebase/php-jwt`), a `public/index.php` front controller, additive
  migrations, SQLite default.

---

## Repository layout

```
packages/core         Blueprint schema + shared types + naming/validation/diff helpers
packages/analyzer     ts-morph analysis → Blueprint (deterministic detection)
packages/generators   EJS template sets → runnable backends (node-layered, node-modular, php-layered)
packages/cli          the `bb` CLI
packages/web          the pipeline web UI (thin Express server + React/Tailwind)
examples/demo-frontend  a sample React+TS app the pipeline runs on
docs/STYLEGUIDE.md    the visual system for the web UI
```

## Determinism

There is no AI anywhere in the analyze or generate path. Detection is syntactic; naming
(pluralisation, table and join-table names) is rule-based; the Blueprint is canonicalised to
a stable ordering before serialisation, so equivalent frontends serialise byte-identically
and regeneration diffs are meaningful.

## License

MIT.
