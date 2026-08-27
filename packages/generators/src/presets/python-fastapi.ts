import { file, literal } from "../render.js";
import type { ColumnView } from "../helpers.js";
import type {
  GenContext,
  GenFile,
  MigrationContext,
  MigrationFile,
  MigrationPlan,
  Preset,
} from "../types.js";

const DIR = "python-fastapi";
const G = "app/generated"; // the owned boundary

/**
 * Python + FastAPI + SQLAlchemy 2.x + Alembic + Pydantic v2, layered. All generated code
 * lives under `app/generated/` (owned); a thin `app/main.py` outside it is written once.
 * camelCase JSON API over snake_case columns via Pydantic aliases. Deterministic, no AI.
 */
export const pythonFastapiPreset: Preset = {
  id: "python-fastapi",
  runtime: "python",
  architecture: "fastapi",
  templateDir: DIR,
  migrationExtension: "py",

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth, py };

    // --- Project root (write-once) ---
    files.push(file("requirements.txt", DIR, "root/requirements.txt.ejs", data, "once"));
    files.push(file(".env.example", DIR, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", DIR, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", DIR, "root/README.md.ejs", data, "once"));
    files.push(file("alembic.ini", DIR, "root/alembic.ini.ejs", data, "once"));
    files.push(file("app/main.py", DIR, "app/main.py.ejs", data, "once"));
    files.push(literal("app/__init__.py", "", "once"));
    files.push(literal("tests/.gitkeep", "", "once"));

    // --- Owned boundary: core + alembic env ---
    files.push(literal(`${G}/__init__.py`, "", "owned"));
    files.push(literal(`${G}/core/__init__.py`, "", "owned"));
    files.push(file(`${G}/core/config.py`, DIR, "generated/core/config.py.ejs", data, "owned"));
    files.push(file(`${G}/core/db.py`, DIR, "generated/core/db.py.ejs", data, "owned"));
    files.push(file(`${G}/core/security.py`, DIR, "generated/core/security.py.ejs", data, "owned"));
    files.push(file(`${G}/alembic/env.py`, DIR, "generated/alembic/env.py.ejs", data, "owned"));
    files.push(file(`${G}/alembic/script.py.mako`, DIR, "generated/alembic/script.py.mako.ejs", data, "owned"));

    // --- Owned boundary: models ---
    files.push(file(`${G}/models/__init__.py`, DIR, "generated/models/__init__.py.ejs", data, "owned"));
    if (view.hasAuth) {
      files.push(file(`${G}/models/user.py`, DIR, "generated/models/user.py.ejs", data, "owned"));
    }
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth, py };
      files.push(file(`${G}/models/${e.varName}.py`, DIR, "generated/models/model.py.ejs", d, "owned"));
    }

    // --- Owned boundary: schemas / services / routers ---
    files.push(literal(`${G}/schemas/__init__.py`, "", "owned"));
    files.push(literal(`${G}/services/__init__.py`, "", "owned"));
    files.push(file(`${G}/routers/__init__.py`, DIR, "generated/routers/__init__.py.ejs", data, "owned"));
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth, py };
      files.push(file(`${G}/schemas/${e.varName}.py`, DIR, "generated/schemas/schema.py.ejs", d, "owned"));
      files.push(file(`${G}/services/${e.varName}.py`, DIR, "generated/services/service.py.ejs", d, "owned"));
      files.push(file(`${G}/routers/${e.varName}.py`, DIR, "generated/routers/router.py.ejs", d, "owned"));
    }

    // --- Owned boundary: auth ---
    if (view.hasAuth) {
      files.push(literal(`${G}/auth/__init__.py`, "", "owned"));
      files.push(file(`${G}/auth/schemas.py`, DIR, "generated/auth/schemas.py.ejs", data, "owned"));
      files.push(file(`${G}/auth/service.py`, DIR, "generated/auth/service.py.ejs", data, "owned"));
      files.push(file(`${G}/auth/deps.py`, DIR, "generated/auth/deps.py.ejs", data, "owned"));
      files.push(file(`${G}/auth/router.py`, DIR, "generated/auth/router.py.ejs", data, "owned"));
    }

    return files;
  },

  migration(ctx: GenContext, plan: MigrationPlan, migCtx?: MigrationContext): MigrationFile | null {
    if (!plan.hasWork) return null;
    const mc = migCtx ?? { sequence: 1, previousRevision: null, revision: "0001" };
    return {
      filename: "",
      contents: file("migrations/_mig.py", DIR, "migrations/migration.py.ejs", {
        plan,
        view: ctx.view,
        py,
        revision: mc.revision,
        downRevision: mc.previousRevision,
        isInit: plan.mode === "init",
      }, "owned").contents,
    };
  },
};

/* ------------------------------------------------------------------ *
 * Deterministic Python/SQLAlchemy/Alembic code fragments — computed
 * here so the templates stay dumb. Passed into every render as `py`.
 * ------------------------------------------------------------------ */
export const py = {
  /** Pydantic field type (without the Optional wrapper). */
  pyType(c: ColumnView): string {
    switch (c.type) {
      case "int":
        return "int";
      case "float":
        return "float";
      case "boolean":
        return "bool";
      case "datetime":
        return "datetime";
      case "enum":
        return `Literal[${(c.enumValues ?? []).map((v) => JSON.stringify(v)).join(", ")}]`;
      case "json":
        return "Any";
      default:
        return "str";
    }
  },

  /** SQLAlchemy column type constructor, e.g. "Integer", "String". */
  saType(c: ColumnView): string {
    switch (c.type) {
      case "int":
        return "Integer";
      case "float":
        return "Float";
      case "boolean":
        return "Boolean";
      case "datetime":
        return "DateTime";
      case "json":
        return "Text";
      case "uuid":
        return "String(36)";
      default:
        return "String";
    }
  },

  /** RHS of a SQLAlchemy model attribute: `Column(...)`. */
  saColumn(c: ColumnView): string {
    if (c.primaryKey) {
      return c.type === "uuid"
        ? `Column(String(36), primary_key=True)`
        : `Column(Integer, primary_key=True, autoincrement=True)`;
    }
    const parts = [this.saType(c)];
    if (c.fkTo && c.fkTable) parts.push(`ForeignKey("${c.fkTable}.id")`);
    parts.push(`nullable=${c.nullable ? "True" : "False"}`);
    return `Column(${parts.join(", ")})`;
  },

  /** An Alembic `sa.Column(...)` for create_table. */
  alembicColumn(c: ColumnView): string {
    if (c.primaryKey) {
      const t = c.type === "uuid" ? "sa.String(length=36)" : "sa.Integer()";
      return `sa.Column("${c.name}", ${t}, primary_key=True${c.type === "uuid" ? "" : ", autoincrement=True"})`;
    }
    const parts = [`"${c.name}"`, this.saTypeCall(c)];
    if (c.fkTo && c.fkTable) parts.push(`sa.ForeignKey("${c.fkTable}.id")`);
    parts.push(`nullable=${c.nullable ? "True" : "False"}`);
    return `sa.Column(${parts.join(", ")})`;
  },

  /** An Alembic `sa.Column(...)` for add_column (NOT NULL gets a server_default). */
  alembicAddColumn(c: ColumnView): string {
    const parts = [`"${c.name}"`, this.saTypeCall(c)];
    if (c.fkTo && c.fkTable) parts.push(`sa.ForeignKey("${c.fkTable}.id")`);
    parts.push(`nullable=${c.nullable ? "True" : "False"}`);
    if (!c.nullable) parts.push(`server_default=${this.serverDefault(c)}`);
    return `sa.Column(${parts.join(", ")})`;
  },

  saTypeCall(c: ColumnView): string {
    switch (c.type) {
      case "int":
        return "sa.Integer()";
      case "float":
        return "sa.Float()";
      case "boolean":
        return "sa.Boolean()";
      case "datetime":
        return "sa.DateTime()";
      case "json":
        return "sa.Text()";
      case "uuid":
        return "sa.String(length=36)";
      default:
        return "sa.String()";
    }
  },

  serverDefault(c: ColumnView): string {
    switch (c.type) {
      case "int":
      case "float":
        return '"0"';
      case "boolean":
        return "sa.text('0')";
      default:
        return '""';
    }
  },

  /** FastAPI path param style: `:id` -> `{id}`. */
  path(httpPath: string): string {
    return httpPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  },
};
