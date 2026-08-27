import { file, literal } from "../render.js";
import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

const MOD = "node-modular";
const BASE = "node-layered"; // reuse the verified root + framework + migration templates
const G = "src/generated";
const SHARED = `${G}/shared`;

/**
 * Node.js + TypeScript, feature-module architecture. Each entity owns a folder under
 * `src/generated/modules/<entity>/` holding its model/service/controller/validator/routes;
 * cross-cutting framework code lives in `src/generated/shared/`. The schema, migrations and
 * project scaffolding are identical to node-layered, so those templates are reused verbatim.
 */
export const nodeModularPreset: Preset = {
  id: "node-modular",
  runtime: "node",
  architecture: "modular",
  templateDir: MOD,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth };

    // --- Project root (reused, write-once) ---
    files.push(file("package.json", BASE, "root/package.json.ejs", data, "once"));
    files.push(file("tsconfig.json", BASE, "root/tsconfig.json.ejs", data, "once"));
    files.push(file("knexfile.ts", BASE, "root/knexfile.ts.ejs", data, "once"));
    files.push(file(".env.example", BASE, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", BASE, "root/gitignore.ejs", data, "once"));
    files.push(file("scripts/migrate.ts", BASE, "scripts/migrate.ts.ejs", data, "once"));
    files.push(file("README.md", MOD, "root/README.md.ejs", data, "once"));
    files.push(file("src/server.ts", MOD, "src/server.ts.ejs", data, "once"));
    files.push(literal("tests/.gitkeep", "", "once"));

    // --- Shared framework (owned) — reuse node-layered bodies; siblings preserved ---
    files.push(file(`${SHARED}/config/env.ts`, BASE, "generated/config/env.ts.ejs", data, "owned"));
    files.push(file(`${SHARED}/config/db.ts`, BASE, "generated/config/db.ts.ejs", data, "owned"));
    files.push(file(`${SHARED}/middleware/error.ts`, BASE, "generated/middleware/error.ts.ejs", data, "owned"));
    files.push(file(`${SHARED}/types.ts`, BASE, "generated/types.ts.ejs", data, "owned"));

    if (view.hasAuth) {
      files.push(file(`${SHARED}/middleware/auth.ts`, BASE, "generated/middleware/auth.ts.ejs", data, "owned"));
      files.push(file(`${SHARED}/auth/auth.service.ts`, BASE, "generated/auth/auth.service.ts.ejs", data, "owned"));
      files.push(file(`${SHARED}/auth/auth.controller.ts`, BASE, "generated/auth/auth.controller.ts.ejs", data, "owned"));
      files.push(file(`${SHARED}/auth/auth.validators.ts`, BASE, "generated/auth/auth.validators.ts.ejs", data, "owned"));
      files.push(file(`${SHARED}/auth/auth.routes.ts`, BASE, "generated/auth/auth.routes.ts.ejs", data, "owned"));
    }

    // --- Per-entity feature modules (owned) ---
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth };
      const dir = `${G}/modules/${e.varName}`;
      files.push(file(`${dir}/${e.varName}.model.ts`, MOD, "modules/model.ts.ejs", d, "owned"));
      files.push(file(`${dir}/${e.varName}.service.ts`, MOD, "modules/service.ts.ejs", d, "owned"));
      files.push(file(`${dir}/${e.varName}.controller.ts`, MOD, "modules/controller.ts.ejs", d, "owned"));
      // The validator has no relative imports — reuse the node-layered body verbatim.
      files.push(file(`${dir}/${e.varName}.validator.ts`, BASE, "generated/validators/validator.ts.ejs", d, "owned"));
      files.push(file(`${dir}/${e.varName}.routes.ts`, MOD, "modules/route.ts.ejs", d, "owned"));
    }
    files.push(file(`${G}/modules/index.ts`, MOD, "modules/index.ts.ejs", data, "owned"));

    return files;
  },

  migration(ctx: GenContext, plan: MigrationPlan): MigrationFile | null {
    if (!plan.hasWork) return null;
    return {
      filename: "",
      contents: file("migrations/_mig.ts", BASE, "migrations/migration.ts.ejs", {
        plan,
        view: ctx.view,
      }, "owned").contents,
    };
  },
};
