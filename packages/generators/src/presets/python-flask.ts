import { file, literal } from "../render.js";
import type { ColumnView } from "../helpers.js";
import type {
  GenContext,
  GenFile,
  MigrationFile,
  MigrationPlan,
  Preset,
} from "../types.js";

const DIR = "python-flask";
const G = "app/generated"; // the owned boundary

/**
 * Python + Flask 3 + Flask-SQLAlchemy (SQLAlchemy 2.x) + PyJWT, layered. All generated
 * code lives under `app/generated/` (owned); a thin `app/__init__.py` create_app() factory
 * outside the boundary is written once. camelCase JSON API over snake_case columns via a
 * hand-written `to_dict()`/`apply_json()` pair and manual validation. Deterministic, no AI.
 *
 * Schema is created at startup by `db.create_all()` (inside the app context) rather than by a
 * migration file, so `migration()` returns null. The README documents this and points at
 * Flask-Migrate for real production schema evolution.
 */
const flaskLayered: Preset = {
  id: "flask-layered",
  runtime: "python",
  framework: "flask",
  architecture: "layered",
  templateDir: DIR,
  migrationExtension: "py",

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth, fl };

    // --- Project root (write-once, user-owned) ---
    files.push(file("requirements.txt", DIR, "root/requirements.txt.ejs", data, "once"));
    files.push(file(".env.example", DIR, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", DIR, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", DIR, "root/README.md.ejs", data, "once"));
    files.push(file("wsgi.py", DIR, "root/wsgi.py.ejs", data, "once"));
    files.push(file("app/__init__.py", DIR, "app/__init__.py.ejs", data, "once"));

    // --- Owned boundary: package marker + db instance ---
    files.push(literal(`${G}/__init__.py`, "", "owned"));
    files.push(file(`${G}/db.py`, DIR, "generated/db.py.ejs", data, "owned"));
    files.push(file(`${G}/api.py`, DIR, "generated/api.py.ejs", data, "owned"));

    // --- Owned boundary: models ---
    files.push(file(`${G}/models/__init__.py`, DIR, "generated/models/__init__.py.ejs", data, "owned"));
    if (view.hasAuth) {
      files.push(file(`${G}/models/user.py`, DIR, "generated/models/user.py.ejs", data, "owned"));
    }
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth, fl };
      files.push(file(`${G}/models/${e.varName}.py`, DIR, "generated/models/model.py.ejs", d, "owned"));
    }

    // --- Owned boundary: schemas / services / routes (each a package) ---
    files.push(literal(`${G}/schemas/__init__.py`, "", "owned"));
    files.push(literal(`${G}/services/__init__.py`, "", "owned"));
    files.push(literal(`${G}/routes/__init__.py`, "", "owned"));
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth, fl };
      files.push(file(`${G}/schemas/${e.varName}.py`, DIR, "generated/schemas/schema.py.ejs", d, "owned"));
      files.push(file(`${G}/services/${e.varName}.py`, DIR, "generated/services/service.py.ejs", d, "owned"));
      files.push(file(`${G}/routes/${e.varName}.py`, DIR, "generated/routes/route.py.ejs", d, "owned"));
    }

    // --- Owned boundary: auth (only if the Blueprint requires it) ---
    if (view.hasAuth) {
      files.push(literal(`${G}/auth/__init__.py`, "", "owned"));
      files.push(file(`${G}/auth/service.py`, DIR, "generated/auth/service.py.ejs", data, "owned"));
      files.push(file(`${G}/auth/decorators.py`, DIR, "generated/auth/decorators.py.ejs", data, "owned"));
      files.push(file(`${G}/auth/routes.py`, DIR, "generated/auth/routes.py.ejs", data, "owned"));
    }

    return files;
  },

  migration(_ctx: GenContext, _plan: MigrationPlan): MigrationFile | null {
    // Flask creates the schema at startup via `db.create_all()` (see app/__init__.py), so there
    // is no standalone migration artifact. For production schema evolution the README points at
    // Flask-Migrate (Alembic). Returning null keeps the pipeline from writing a migration file.
    return null;
  },
};

export const pythonFlaskPresets: Preset[] = [flaskLayered];

/* ------------------------------------------------------------------ *
 * Deterministic Flask / Flask-SQLAlchemy code fragments — computed
 * here so the templates stay dumb. Passed into every render as `fl`.
 * Mirrors the `py` helper object in python-fastapi.ts.
 * ------------------------------------------------------------------ */
export const fl = {
  /** Flask-SQLAlchemy column type constructor, e.g. "db.Integer", "db.String". */
  saType(c: ColumnView): string {
    switch (c.type) {
      case "int":
        return "db.Integer";
      case "float":
        return "db.Float";
      case "boolean":
        return "db.Boolean";
      case "datetime":
        return "db.DateTime";
      case "json":
        // SQLite has no JSON column; JSON payloads are stored as serialised Text.
        return "db.Text";
      case "uuid":
        return "db.String(36)";
      default:
        return "db.String";
    }
  },

  /** RHS of a Flask-SQLAlchemy model attribute: `db.Column(...)`. */
  column(c: ColumnView): string {
    if (c.primaryKey) {
      return c.type === "uuid"
        ? `db.Column(db.String(36), primary_key=True)`
        : `db.Column(db.Integer, primary_key=True, autoincrement=True)`;
    }
    const parts = [this.saType(c)];
    if (c.fkTo && c.fkTable) parts.push(`db.ForeignKey("${c.fkTable}.id")`);
    parts.push(`nullable=${c.nullable ? "True" : "False"}`);
    return `db.Column(${parts.join(", ")})`;
  },

  /** Python type hint for a column value (without the Optional wrapper). */
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

  /**
   * Expression that serialises a column to a JSON-safe value inside `to_dict()`.
   * `datetime` becomes an ISO-8601 string; everything else is emitted as-is.
   */
  jsonValue(c: ColumnView): string {
    if (c.type === "datetime") {
      return `self.${c.name}.isoformat() if self.${c.name} is not None else None`;
    }
    return `self.${c.name}`;
  },

  /**
   * Python `isinstance(...)` type used by manual validation, or `null` when no runtime
   * type check applies (free-form JSON payloads).
   */
  jsonCheck(c: ColumnView): string | null {
    switch (c.type) {
      case "int":
        return "int";
      case "float":
        // JSON has one number type; accept ints where a float is expected.
        return "(int, float)";
      case "boolean":
        return "bool";
      case "json":
        return null;
      // enum / uuid / datetime all travel over the wire as strings.
      default:
        return "str";
    }
  },

  /** Regex-safe Python list literal of an enum's allowed values, for membership checks. */
  enumLiteral(c: ColumnView): string {
    return `[${(c.enumValues ?? []).map((v) => JSON.stringify(v)).join(", ")}]`;
  },

  /** The URL parameter name in an express-style path (`/tasks/:id` -> "id"), or null. */
  paramName(httpPath: string): string | null {
    const m = httpPath.match(/:([A-Za-z0-9_]+)/);
    return m ? m[1] : null;
  },

  /**
   * Flask route rule for an express-style path. Integer primary keys get the `<int:...>`
   * converter so Flask coerces the value; string/uuid keys stay as plain `<...>`.
   */
  route(httpPath: string, pkType: "int" | "uuid"): string {
    return httpPath.replace(/:([A-Za-z0-9_]+)/g, (_full, name) =>
      pkType === "int" ? `<int:${name}>` : `<${name}>`,
    );
  },
};
