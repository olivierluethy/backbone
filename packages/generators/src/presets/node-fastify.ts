import { file, literal } from "../render.js";
import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

/**
 * Fastify template set.
 *
 *  - `fastify / layered` — horizontal layers (models → services → controllers → routes) with
 *    every per-entity file under the owned `src/generated/` boundary. A thin `src/server.ts`
 *    outside it is written once and is the developer's to extend.
 *
 * Runtime stack: Fastify 4 + Knex (better-sqlite3 by default, MySQL optional) + zod validation
 * (+ @fastify/jwt for auth when the Blueprint requires it). The Knex schema/migration approach is
 * deliberately shared with the Express (`node-layered`) preset so both stacks are equally runnable
 * and their databases are byte-for-byte compatible: the migration, knexfile, migrate script,
 * .env.example and .gitignore templates are reused from `node-layered` verbatim.
 */

const FASTIFY = "node-fastify"; // this preset's own templates
const LAYERED = "node-layered"; // Express preset — reused for schema/root scaffolding
const G = "src/generated"; // the owned boundary

/** Fastify · Layered — the idiomatic default (and only) architecture for this runtime. */
const fastifyLayered: Preset = {
  id: "fastify-layered",
  runtime: "node",
  framework: "fastify",
  architecture: "layered",
  templateDir: FASTIFY,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth };

    // --- Project root (write-once, user-owned) ---
    // Fastify-specific manifests/entrypoint/docs are authored here...
    files.push(file("package.json", FASTIFY, "root/package.json.ejs", data, "once"));
    files.push(file("tsconfig.json", FASTIFY, "root/tsconfig.json.ejs", data, "once"));
    files.push(file("README.md", FASTIFY, "root/README.md.ejs", data, "once"));
    files.push(file("src/server.ts", FASTIFY, "src/server.ts.ejs", data, "once"));
    // ...while the framework-agnostic Knex scaffolding is reused from node-layered verbatim.
    files.push(file("knexfile.ts", LAYERED, "root/knexfile.ts.ejs", data, "once"));
    files.push(file(".env.example", LAYERED, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", LAYERED, "root/gitignore.ejs", data, "once"));
    files.push(file("scripts/migrate.ts", LAYERED, "scripts/migrate.ts.ejs", data, "once"));
    files.push(literal("tests/.gitkeep", "", "once"));

    // --- Owned boundary: framework wiring ---
    files.push(file(`${G}/config/env.ts`, FASTIFY, "generated/config/env.ts.ejs", data, "owned"));
    files.push(file(`${G}/config/db.ts`, FASTIFY, "generated/config/db.ts.ejs", data, "owned"));
    files.push(file(`${G}/lib/http-error.ts`, FASTIFY, "generated/lib/http-error.ts.ejs", data, "owned"));
    files.push(file(`${G}/routes/index.ts`, FASTIFY, "generated/routes/index.ts.ejs", data, "owned"));

    if (view.hasAuth) {
      files.push(file(`${G}/plugins/auth.ts`, FASTIFY, "generated/plugins/auth.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.service.ts`, FASTIFY, "generated/auth/auth.service.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.routes.ts`, FASTIFY, "generated/auth/auth.routes.ts.ejs", data, "owned"));
    }

    // --- Owned boundary: per-entity layers ---
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth };
      files.push(file(`${G}/schemas/${e.varName}.schema.ts`, FASTIFY, "generated/schemas/schema.ts.ejs", d, "owned"));
      files.push(file(`${G}/models/${e.varName}.model.ts`, FASTIFY, "generated/models/model.ts.ejs", d, "owned"));
      files.push(file(`${G}/services/${e.varName}.service.ts`, FASTIFY, "generated/services/service.ts.ejs", d, "owned"));
      files.push(
        file(`${G}/controllers/${e.varName}.controller.ts`, FASTIFY, "generated/controllers/controller.ts.ejs", d, "owned"),
      );
      files.push(file(`${G}/routes/${e.varName}.routes.ts`, FASTIFY, "generated/routes/route.ts.ejs", d, "owned"));
    }

    return files;
  },

  migration(ctx: GenContext, plan: MigrationPlan): MigrationFile | null {
    if (!plan.hasWork) return null;
    // Reuse node-layered's Knex migration verbatim — the schema (including the auth `users`
    // table when view.hasAuth) is identical across the Express and Fastify presets.
    return {
      filename: "",
      contents: file("migrations/_mig.ts", LAYERED, "migrations/migration.ts.ejs", {
        plan,
        view: ctx.view,
      }, "owned").contents,
    };
  },
};

export const nodeFastifyPresets: Preset[] = [fastifyLayered];
