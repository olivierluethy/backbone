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
- **Two independent axes: framework × architecture.** Choose a **framework** — Node
  (Express.js · NestJS · Fastify), PHP (Laravel · Symfony · plain PHP), Python (Django ·
  FastAPI · Flask) — and, separately, an **architectural pattern** (Layered · Clean · Onion ·
  Monolithic · MVC · MVVM · Microservices). A shared **capability matrix** decides which
  combinations are valid; the UI greys the rest with a reason. SQLite out of the box.
- **Frontend-framework detection.** The analyzer identifies the frontend framework (React,
  Next.js, Vue, Angular, Svelte, Solid…) deterministically from `package.json` + source
  signals, and surfaces it — or "undetected", never a guess.
- **Traceable.** Every Blueprint node records the frontend `file:line` it came from; a
  `GENERATION_REPORT.md` maps each requirement to the backend component it produced, and a
  `docs/ARCHITECTURE.md` documents the chosen pattern's layering.
- **Additive regeneration.** Change the frontend, regenerate: Backbone diffs the Blueprint,
  writes new timestamped migrations (never editing old ones), overwrites only the generated
  boundary, and never touches your own code.

---

## Getting started (no coding experience needed)

You'll run a few copy‑paste commands in a **terminal** (Terminal on macOS/Linux, or PowerShell on
Windows). Follow the steps in order. You only do steps 1–3 once; after that, starting the app is a
single command.

### Step 1 — Install the two tools it needs

Backbone needs **Node.js** (the runtime) and **pnpm** (the installer). Install them once:

1. **Node.js 20 or newer** — download the "LTS" installer from
   [nodejs.org](https://nodejs.org) and run it (just click through).
2. **pnpm** — after Node is installed, open your terminal and run:

   ```bash
   npm install -g pnpm
   ```

To check both are ready, run `node --version` (should print `v20` or higher) and `pnpm --version`.

> PHP 8.1+ and Composer are **only** needed if you later want to *run* a generated PHP backend —
> not to use Backbone itself.

### Step 2 — Open the project folder in your terminal

Point the terminal at this project folder with `cd` (short for "change directory"). For example, if
the folder is on your Desktop:

```bash
cd ~/Desktop/Backbone      # macOS/Linux
cd %USERPROFILE%\Desktop\Backbone   # Windows PowerShell
```

Tip: on most systems you can type `cd ` (with a space) and then drag the folder onto the terminal
window to fill in the path.

### Step 3 — One‑time setup

Run these two commands once. The first downloads everything the project depends on (it can take a
couple of minutes the first time); the second prepares the app.

```bash
pnpm install
pnpm build
```

### Step 4 — Start the app

```bash
pnpm web
```

This launches Backbone. Wait a few seconds until the terminal shows a line like
`VITE ... ready` and a `Local:` link, then open this address in your web browser:

**→ http://localhost:5410**

That's the whole app. Leave the terminal window open while you use it — it's running the app in the
background. To **stop** it, click the terminal and press **Ctrl + C**. To start it again another day,
you only need step 4 (`pnpm web`) — not the setup steps.

> **Why isn't `pnpm build` enough on its own?** `build` only *prepares* the code; it doesn't launch
> anything. `pnpm web` is what actually *starts* the app (it runs two small local servers — the web
> page on port **5410** and a helper on **5411** — for you automatically). Always use `pnpm web` to
> open Backbone.

**Something not working?**
- *"command not found: pnpm"* → redo step 1 (`npm install -g pnpm`), then close and reopen the terminal.
- *The browser page won't load* → make sure the terminal from step 4 is still open and hasn't shown an
  error; give it a few seconds after `ready`, then refresh **http://localhost:5410**.
- *Port already in use* → another copy is probably already running; press **Ctrl + C** in any old
  terminal, or just open **http://localhost:5410**.

### What you can do in the UI

Step through the pipeline: **Browse…** to pick a frontend folder
(or type a path), analyze (the **detected frontend framework** shows as a badge), review the
Blueprint as an ERD of drafting cards with relation connectors, toggle entities / fields /
endpoints, follow source-ref links back into the frontend, pick a **runtime → framework →
architecture** (invalid combinations are greyed with a reason), and generate. Results come
with a formatted status summary, a **Database** view (a relational ER diagram with explicit
1:1 / 1:N / N:N cardinalities), a **VS Code–grade file explorer** (resizable panes, tabs with
single-click preview / double-click open, side-by-side split editor, editor zoom, per-file and
whole-project **Open in VS Code**, copy / download / **Download project (.zip)** or a
selection), a **Mermaid structure** view, and the generation report. The action button
auto-labels **Generate** vs **Regenerate** based on the target; regenerating shows the
additive change set.

### The CLI (optional — for developers)

Prefer the terminal? The same pipeline is available as a `bb` command. You can skip this if you're
using the web UI.

```bash
# Analyse a frontend into a Blueprint (and print a traceable summary)
pnpm bb analyze examples/demo-frontend --out blueprint.json

# Review a saved Blueprint
pnpm bb review blueprint.json

# Generate a backend — pick a framework, and optionally an architecture
# (--framework implies its runtime; --architecture defaults to the framework's idiomatic pattern)
pnpm bb generate examples/demo-frontend --framework express  --architecture layered     --out ./backend-express
pnpm bb generate examples/demo-frontend --framework nestjs   --architecture mvc         --out ./backend-nest
pnpm bb generate examples/demo-frontend --framework fastify                              --out ./backend-fastify
pnpm bb generate examples/demo-frontend --framework laravel                              --out ./backend-laravel
pnpm bb generate examples/demo-frontend --framework fastapi  --architecture layered      --out ./backend-fastapi

# Regenerate additively after the frontend changes
pnpm bb regenerate --out ./backend-express --frontend examples/demo-frontend

# See the full capability matrix (valid combinations, ● = generatable) and registered sets
pnpm bb combos
pnpm bb presets
```

Run a generated Node backend:

```bash
cd backend-node && npm install && cp .env.example .env && npm run migrate && npm run dev
```

---

## What gets detected

From `src/**/*.{ts,tsx,js,jsx,mjs,cjs}` (TypeScript **and** JavaScript), plus the `<script>`
blocks of `.vue`/`.svelte` single-file components — so React, Vue, Angular, Svelte and Solid
frontends are all analysable. Fixed rules:

| Concept | Rule |
|---|---|
| **Entity** | an exported `interface`/`type` that is under `models/`·`types/`·`entities/`, is annotated `/** @entity */`, or is used as an API call's request/response payload. **Typeless JS fallback:** when a project has no type declarations, coarse entities are inferred per REST resource (id + fields seen in request bodies) and flagged in the Blueprint for refinement |
| **Field** | name, nullability (`?` / `\| null`), TS type → primitive (`string`, `int`/`float`, `boolean`, `Date→datetime`, string-literal union → `enum`) |
| **Relation** | entity-typed field → many-to-one (FK); `Entity[]` → one-to-many; `<name>Id` → FK; arrays on both sides → many-to-many via a join table |
| **Endpoint** | `fetch`, `axios.<method>`, or a typed client `api.get/post/…`; HTTP method + URL → path pattern (`:id`) → CRUD, associated to an entity by payload type or path segment |
| **Auth** | a login/register call or bearer-token usage; token-bearing endpoints are marked protected |
| **Datastore** | inferred only when a persisted operation exists |

Only endpoints actually present in the frontend are generated. An optional
`backbone.manifest.(ts|json)` in the frontend root can override or augment what is detected.

---

## Generated backend

Each framework emits a complete project. Everything under the generated boundary
(`src/generated/`, `app/generated/`, `app/Generated/`, `src/Generated/`, …) is **owned by
Backbone** and overwritten on every regenerate; the thin entrypoint and project config outside
it are written **once** and never touched again. Every generated file carries English doc and
section comments derived from the Blueprint. A `docs/ARCHITECTURE.md` documents the chosen
pattern's layers and dependency rule.

Frameworks (idiomatic default architecture shown):

- **Express.js · layered** — Express + TypeScript + Knex, zod validation, error middleware,
  JWT auth; also ships a **monolithic** (feature-module) variant.
- **NestJS · MVC** — Nest 10 + TypeORM + class-validator DTOs, per-entity modules, JWT guard.
- **Fastify · layered** — Fastify 4 + Knex + zod, plugin-based routes, JWT.
- **Laravel · MVC** — Eloquent models, resource controllers, FormRequest validators, api routes.
- **Symfony · MVC** — Doctrine entities + attribute-routed controllers + repositories.
- **Plain PHP · layered** — PDO, per-entity validators, a `public/index.php` front controller.
- **Django · MVC** — Django + DRF + SimpleJWT, model-derived migrations, camelCase JSON.
- **FastAPI · layered** — FastAPI + SQLAlchemy 2 + Alembic, Pydantic v2, JWT.
- **Flask · layered** — Flask 3 + SQLAlchemy 2, blueprints per entity, PyJWT auth.

The **architecture** axis (Layered · Clean · Onion · Monolithic · MVC · MVVM · Microservices)
selects the project's structure and dependency direction independently of the framework; run
`bb combos` to see which framework × architecture combinations are generatable in this build.

---

## Repository layout

```
packages/core         Blueprint schema + shared types + the framework/architecture capability matrix
packages/analyzer     ts-morph analysis → Blueprint (deterministic detection, incl. frontend framework)
packages/generators   EJS template sets → runnable backends, keyed by runtime × framework × architecture
packages/cli          the `bb` CLI (bb combos shows the matrix)
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
