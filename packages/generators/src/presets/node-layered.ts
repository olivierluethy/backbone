import { file, literal } from "../render.js";
import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

const DIR = "node-layered";
const G = "src/generated"; // the owned boundary

/**
 * Node.js + TypeScript, layered architecture. All per-entity code lives under
 * `src/generated/` (the owned boundary). A thin `src/server.ts` outside it is written once
 * and is the developer's to extend.
 */
export const nodeLayeredPreset: Preset = {
  id: "node-layered",
  runtime: "node",
  architecture: "layered",
  templateDir: DIR,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth };

    // --- Project root (write-once user-owned) ---
    files.push(file("package.json", DIR, "root/package.json.ejs", data, "once"));
    files.push(file("tsconfig.json", DIR, "root/tsconfig.json.ejs", data, "once"));
    files.push(file("knexfile.ts", DIR, "root/knexfile.ts.ejs", data, "once"));
    files.push(file(".env.example", DIR, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", DIR, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", DIR, "root/README.md.ejs", data, "once"));
    files.push(file("src/server.ts", DIR, "src/server.ts.ejs", data, "once"));
    files.push(file("scripts/migrate.ts", DIR, "scripts/migrate.ts.ejs", data, "once"));
    files.push(literal("tests/.gitkeep", "", "once"));

    // --- Owned boundary: framework ---
    files.push(file(`${G}/config/env.ts`, DIR, "generated/config/env.ts.ejs", data, "owned"));
    files.push(file(`${G}/config/db.ts`, DIR, "generated/config/db.ts.ejs", data, "owned"));
    files.push(file(`${G}/middleware/error.ts`, DIR, "generated/middleware/error.ts.ejs", data, "owned"));
    files.push(file(`${G}/types.ts`, DIR, "generated/types.ts.ejs", data, "owned"));
    files.push(file(`${G}/routes/index.ts`, DIR, "generated/routes/index.ts.ejs", data, "owned"));

    if (view.hasAuth) {
      files.push(file(`${G}/middleware/auth.ts`, DIR, "generated/middleware/auth.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.service.ts`, DIR, "generated/auth/auth.service.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.controller.ts`, DIR, "generated/auth/auth.controller.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.validators.ts`, DIR, "generated/auth/auth.validators.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.routes.ts`, DIR, "generated/auth/auth.routes.ts.ejs", data, "owned"));
    }

    // --- Owned boundary: per-entity layers ---
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth };
      files.push(file(`${G}/models/${e.varName}.model.ts`, DIR, "generated/models/model.ts.ejs", d, "owned"));
      files.push(file(`${G}/services/${e.varName}.service.ts`, DIR, "generated/services/service.ts.ejs", d, "owned"));
      files.push(
        file(`${G}/controllers/${e.varName}.controller.ts`, DIR, "generated/controllers/controller.ts.ejs", d, "owned"),
      );
      files.push(
        file(`${G}/validators/${e.varName}.validator.ts`, DIR, "generated/validators/validator.ts.ejs", d, "owned"),
      );
      files.push(file(`${G}/routes/${e.varName}.routes.ts`, DIR, "generated/routes/route.ts.ejs", d, "owned"));
    }

    return files;
  },

  migration(ctx: GenContext, plan: MigrationPlan): MigrationFile | null {
    if (!plan.hasWork) return null;
    return {
      filename: "",
      contents: file("migrations/_mig.ts", DIR, "migrations/migration.ts.ejs", {
        plan,
        view: ctx.view,
      }, "owned").contents,
    };
  },
};
