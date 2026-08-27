import { file, literal } from "../render.js";
import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

/**
 * Express.js template sets.
 *
 *  - `express / layered`  — horizontal layers (models → services → controllers → routes) with
 *    every per-entity file under the owned `src/generated/` boundary. A thin `src/server.ts`
 *    outside it is written once and is the developer's to extend.
 *  - `express / monolithic` — the same runtime, organised as a modular monolith: each entity
 *    owns a feature module under `src/generated/modules/<entity>/`, cross-cutting framework
 *    code lives in `src/generated/shared/`. Schema, migrations and scaffolding are shared with
 *    the layered set verbatim (only the per-entity wiring differs).
 */

const LAYERED = "node-layered";
const MODULAR = "node-modular";
const G = "src/generated"; // the owned boundary
const SHARED = `${G}/shared`;

/** Express.js · Layered — the idiomatic default. */
const expressLayered: Preset = {
  id: "express-layered",
  runtime: "node",
  framework: "express",
  architecture: "layered",
  templateDir: LAYERED,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth };

    // --- Project root (write-once user-owned) ---
    files.push(file("package.json", LAYERED, "root/package.json.ejs", data, "once"));
    files.push(file("tsconfig.json", LAYERED, "root/tsconfig.json.ejs", data, "once"));
    files.push(file("knexfile.ts", LAYERED, "root/knexfile.ts.ejs", data, "once"));
    files.push(file(".env.example", LAYERED, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", LAYERED, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", LAYERED, "root/README.md.ejs", data, "once"));
    files.push(file("src/server.ts", LAYERED, "src/server.ts.ejs", data, "once"));
    files.push(file("scripts/migrate.ts", LAYERED, "scripts/migrate.ts.ejs", data, "once"));
    files.push(literal("tests/.gitkeep", "", "once"));

    // --- Owned boundary: framework ---
    files.push(file(`${G}/config/env.ts`, LAYERED, "generated/config/env.ts.ejs", data, "owned"));
    files.push(file(`${G}/config/db.ts`, LAYERED, "generated/config/db.ts.ejs", data, "owned"));
    files.push(file(`${G}/middleware/error.ts`, LAYERED, "generated/middleware/error.ts.ejs", data, "owned"));
    files.push(file(`${G}/types.ts`, LAYERED, "generated/types.ts.ejs", data, "owned"));
    files.push(file(`${G}/routes/index.ts`, LAYERED, "generated/routes/index.ts.ejs", data, "owned"));

    if (view.hasAuth) {
      files.push(file(`${G}/middleware/auth.ts`, LAYERED, "generated/middleware/auth.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.service.ts`, LAYERED, "generated/auth/auth.service.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.controller.ts`, LAYERED, "generated/auth/auth.controller.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.validators.ts`, LAYERED, "generated/auth/auth.validators.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.routes.ts`, LAYERED, "generated/auth/auth.routes.ts.ejs", data, "owned"));
    }

    // --- Owned boundary: per-entity layers ---
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth };
      files.push(file(`${G}/models/${e.varName}.model.ts`, LAYERED, "generated/models/model.ts.ejs", d, "owned"));
      files.push(file(`${G}/services/${e.varName}.service.ts`, LAYERED, "generated/services/service.ts.ejs", d, "owned"));
      files.push(
        file(`${G}/controllers/${e.varName}.controller.ts`, LAYERED, "generated/controllers/controller.ts.ejs", d, "owned"),
      );
      files.push(
        file(`${G}/validators/${e.varName}.validator.ts`, LAYERED, "generated/validators/validator.ts.ejs", d, "owned"),
      );
      files.push(file(`${G}/routes/${e.varName}.routes.ts`, LAYERED, "generated/routes/route.ts.ejs", d, "owned"));
    }

    return files;
  },

  migration(ctx: GenContext, plan: MigrationPlan): MigrationFile | null {
    if (!plan.hasWork) return null;
    return {
      filename: "",
      contents: file("migrations/_mig.ts", LAYERED, "migrations/migration.ts.ejs", {
        plan,
        view: ctx.view,
      }, "owned").contents,
    };
  },
};

/** Express.js · Monolithic — feature-module layout (modular monolith). */
const expressMonolithic: Preset = {
  id: "express-monolithic",
  runtime: "node",
  framework: "express",
  architecture: "monolithic",
  templateDir: MODULAR,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth };

    // --- Project root (reused from layered, write-once) ---
    files.push(file("package.json", LAYERED, "root/package.json.ejs", data, "once"));
    files.push(file("tsconfig.json", LAYERED, "root/tsconfig.json.ejs", data, "once"));
    files.push(file("knexfile.ts", LAYERED, "root/knexfile.ts.ejs", data, "once"));
    files.push(file(".env.example", LAYERED, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", LAYERED, "root/gitignore.ejs", data, "once"));
    files.push(file("scripts/migrate.ts", LAYERED, "scripts/migrate.ts.ejs", data, "once"));
    files.push(file("README.md", MODULAR, "root/README.md.ejs", data, "once"));
    files.push(file("src/server.ts", MODULAR, "src/server.ts.ejs", data, "once"));
    files.push(literal("tests/.gitkeep", "", "once"));

    // --- Shared framework (owned) — reuse layered bodies ---
    files.push(file(`${SHARED}/config/env.ts`, LAYERED, "generated/config/env.ts.ejs", data, "owned"));
    files.push(file(`${SHARED}/config/db.ts`, LAYERED, "generated/config/db.ts.ejs", data, "owned"));
    files.push(file(`${SHARED}/middleware/error.ts`, LAYERED, "generated/middleware/error.ts.ejs", data, "owned"));
    files.push(file(`${SHARED}/types.ts`, LAYERED, "generated/types.ts.ejs", data, "owned"));

    if (view.hasAuth) {
      files.push(file(`${SHARED}/middleware/auth.ts`, LAYERED, "generated/middleware/auth.ts.ejs", data, "owned"));
      files.push(file(`${SHARED}/auth/auth.service.ts`, LAYERED, "generated/auth/auth.service.ts.ejs", data, "owned"));
      files.push(file(`${SHARED}/auth/auth.controller.ts`, LAYERED, "generated/auth/auth.controller.ts.ejs", data, "owned"));
      files.push(file(`${SHARED}/auth/auth.validators.ts`, LAYERED, "generated/auth/auth.validators.ts.ejs", data, "owned"));
      files.push(file(`${SHARED}/auth/auth.routes.ts`, LAYERED, "generated/auth/auth.routes.ts.ejs", data, "owned"));
    }

    // --- Per-entity feature modules (owned) ---
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth };
      const dir = `${G}/modules/${e.varName}`;
      files.push(file(`${dir}/${e.varName}.model.ts`, MODULAR, "modules/model.ts.ejs", d, "owned"));
      files.push(file(`${dir}/${e.varName}.service.ts`, MODULAR, "modules/service.ts.ejs", d, "owned"));
      files.push(file(`${dir}/${e.varName}.controller.ts`, MODULAR, "modules/controller.ts.ejs", d, "owned"));
      files.push(file(`${dir}/${e.varName}.validator.ts`, LAYERED, "generated/validators/validator.ts.ejs", d, "owned"));
      files.push(file(`${dir}/${e.varName}.routes.ts`, MODULAR, "modules/route.ts.ejs", d, "owned"));
    }
    files.push(file(`${G}/modules/index.ts`, MODULAR, "modules/index.ts.ejs", data, "owned"));

    return files;
  },

  migration(ctx: GenContext, plan: MigrationPlan): MigrationFile | null {
    if (!plan.hasWork) return null;
    return {
      filename: "",
      contents: file("migrations/_mig.ts", LAYERED, "migrations/migration.ts.ejs", {
        plan,
        view: ctx.view,
      }, "owned").contents,
    };
  },
};

export const nodeExpressPresets: Preset[] = [expressLayered, expressMonolithic];
