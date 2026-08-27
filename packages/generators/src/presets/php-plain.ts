import { file, literal } from "../render.js";
import type { ColumnView, EntityView } from "../helpers.js";
import type { SqlDialect } from "@backbone/core";
import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

const DIR = "php-layered";
const G = "app/Generated"; // the owned boundary

/**
 * Plain PHP 8.3 + PDO, layered architecture — the dependency-free baseline framework. All
 * generated code lives under `app/Generated/` (the owned boundary, PSR-4 `App\Generated\`).
 * A thin `public/index.php` outside it is written once and is the developer's to extend.
 * Deterministic, no AI.
 */
const phpPlainLayered: Preset = {
  id: "php-plain-layered",
  runtime: "php",
  framework: "php-plain",
  architecture: "layered",
  templateDir: DIR,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth };

    // --- Project root (write-once user-owned) ---
    files.push(file("composer.json", DIR, "root/composer.json.ejs", data, "once"));
    files.push(file(".env.example", DIR, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", DIR, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", DIR, "root/README.md.ejs", data, "once"));
    files.push(file("public/index.php", DIR, "public/index.php.ejs", data, "once"));
    files.push(file("bin/migrate.php", DIR, "bin/migrate.php.ejs", data, "once"));
    files.push(literal("tests/.gitkeep", "", "once"));

    // --- Owned boundary: framework ---
    files.push(file(`${G}/Config/Env.php`, DIR, "generated/Config/Env.php.ejs", data, "owned"));
    files.push(file(`${G}/Config/Database.php`, DIR, "generated/Config/Database.php.ejs", data, "owned"));
    files.push(file(`${G}/Support/Request.php`, DIR, "generated/Support/Request.php.ejs", data, "owned"));
    files.push(file(`${G}/Support/Response.php`, DIR, "generated/Support/Response.php.ejs", data, "owned"));
    files.push(file(`${G}/Support/CaseMap.php`, DIR, "generated/Support/CaseMap.php.ejs", data, "owned"));
    files.push(file(`${G}/Support/HttpException.php`, DIR, "generated/Support/HttpException.php.ejs", data, "owned"));
    files.push(file(`${G}/Support/ValidationException.php`, DIR, "generated/Support/ValidationException.php.ejs", data, "owned"));
    files.push(file(`${G}/Http/Router.php`, DIR, "generated/Http/Router.php.ejs", data, "owned"));
    files.push(file(`${G}/Middleware/ErrorHandler.php`, DIR, "generated/Middleware/ErrorHandler.php.ejs", data, "owned"));
    files.push(file(`${G}/Routes/routes.php`, DIR, "generated/Routes/routes.php.ejs", data, "owned"));

    if (view.hasAuth) {
      files.push(file(`${G}/Middleware/AuthMiddleware.php`, DIR, "generated/Middleware/AuthMiddleware.php.ejs", data, "owned"));
      files.push(file(`${G}/Auth/AuthService.php`, DIR, "generated/Auth/AuthService.php.ejs", data, "owned"));
      files.push(file(`${G}/Auth/AuthController.php`, DIR, "generated/Auth/AuthController.php.ejs", data, "owned"));
      files.push(file(`${G}/Auth/AuthValidator.php`, DIR, "generated/Auth/AuthValidator.php.ejs", data, "owned"));
    }

    // --- Owned boundary: per-entity layers ---
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth };
      files.push(file(`${G}/Models/${e.className}.php`, DIR, "generated/Models/model.php.ejs", d, "owned"));
      files.push(file(`${G}/Services/${e.className}Service.php`, DIR, "generated/Services/service.php.ejs", d, "owned"));
      files.push(file(`${G}/Controllers/${e.className}Controller.php`, DIR, "generated/Controllers/controller.php.ejs", d, "owned"));
      files.push(file(`${G}/Validators/${e.className}Validator.php`, DIR, "generated/Validators/validator.php.ejs", d, "owned"));
    }

    return files;
  },

  migration(ctx: GenContext, plan: MigrationPlan): MigrationFile | null {
    if (!plan.hasWork) return null;
    const dialect = ctx.options.dialect ?? ctx.view.dialect;
    const statements = buildMigrationSql(plan, ctx.view, dialect);
    return {
      filename: "",
      contents: file("migrations/_mig.php", DIR, "migrations/migration.php.ejs", {
        isInit: plan.mode === "init",
        statements,
        removedNotes: plan.removedNotes,
      }, "owned").contents,
    };
  },
};

export const phpPlainPresets: Preset[] = [phpPlainLayered];

/* ------------------------------------------------------------------ *
 * Deterministic SQL DDL — computed here so the template stays dumb.
 * ------------------------------------------------------------------ */

/** Map a Blueprint primitive to a SQL column type per dialect. */
function sqlType(c: ColumnView, dialect: SqlDialect): string {
  const sqlite = dialect === "sqlite";
  switch (c.type) {
    case "int":
      return sqlite ? "INTEGER" : "INT";
    case "float":
      return sqlite ? "REAL" : "DOUBLE";
    case "boolean":
      return sqlite ? "INTEGER" : "TINYINT(1)";
    case "datetime":
      return sqlite ? "TEXT" : "DATETIME";
    case "json":
      return sqlite ? "TEXT" : "JSON";
    case "string":
    case "uuid":
    case "enum":
    default:
      return sqlite ? "TEXT" : "VARCHAR(255)";
  }
}

/** Primary-key clause for an int/uuid PK, per dialect. */
function pkClause(c: ColumnView, dialect: SqlDialect): string {
  if (c.type === "uuid") return `${c.name} ${sqlType(c, dialect)} PRIMARY KEY`;
  return dialect === "sqlite"
    ? `${c.name} INTEGER PRIMARY KEY AUTOINCREMENT`
    : `${c.name} INT AUTO_INCREMENT PRIMARY KEY`;
}

/** A SQL default for a NOT NULL column added to an existing (possibly populated) table. */
function sqlDefault(c: ColumnView): string {
  switch (c.type) {
    case "int":
    case "float":
    case "boolean":
      return "0";
    default:
      return "''";
  }
}

/** Column DDL fragment for CREATE TABLE (no PK — handled separately). */
function columnDdl(c: ColumnView, dialect: SqlDialect): string {
  let ddl = `${c.name} ${sqlType(c, dialect)}`;
  ddl += c.nullable ? "" : " NOT NULL";
  if (c.fkTo && c.fkTable) ddl += ` REFERENCES ${c.fkTable}(id)`;
  return ddl;
}

function createTable(name: string, lines: string[]): string {
  return `CREATE TABLE ${name} (\n  ${lines.join(",\n  ")}\n)`;
}

function usersTable(view: { authUserExtraColumns: ColumnView[]; auth: { roles: string[] } }, dialect: SqlDialect): string {
  const role = view.auth.roles[0] ?? "member";
  const strType = dialect === "sqlite" ? "TEXT" : "VARCHAR(255)";
  const dt = dialect === "sqlite" ? "TEXT" : "DATETIME";
  const lines = [
    dialect === "sqlite" ? "id INTEGER PRIMARY KEY AUTOINCREMENT" : "id INT AUTO_INCREMENT PRIMARY KEY",
    `email ${strType} NOT NULL UNIQUE`,
    `password_hash ${strType} NOT NULL`,
    `role ${strType} NOT NULL DEFAULT '${role}'`,
    ...view.authUserExtraColumns.map((c) => columnDdl(c, dialect)),
    `created_at ${dt} NOT NULL`,
  ];
  return createTable("users", lines);
}

function entityTable(e: EntityView, dialect: SqlDialect): string {
  const lines = e.columns.map((c) => (c.primaryKey ? pkClause(c, dialect) : columnDdl(c, dialect)));
  return createTable(e.table, lines);
}

function joinTable(j: { name: string; left: string; right: string; leftFk: string; rightFk: string }, dialect: SqlDialect): string {
  const lines = [
    `${j.leftFk} INTEGER NOT NULL REFERENCES ${j.left}(id) ON DELETE CASCADE`,
    `${j.rightFk} INTEGER NOT NULL REFERENCES ${j.right}(id) ON DELETE CASCADE`,
    `PRIMARY KEY (${j.leftFk}, ${j.rightFk})`,
  ];
  return createTable(j.name, lines);
}

/** Build the ordered `up` SQL statements for a migration plan. */
function buildMigrationSql(plan: MigrationPlan, view: GenContext["view"], dialect: SqlDialect): string[] {
  const out: string[] = [];
  if (plan.mode === "init" && view.hasAuth) out.push(usersTable(view, dialect));
  for (const e of plan.newTables) out.push(entityTable(e, dialect));
  for (const j of plan.newJoinTables) out.push(joinTable(j, dialect));
  for (const a of plan.addedColumns) {
    const c = a.column;
    let sql = `ALTER TABLE ${a.table} ADD COLUMN ${c.name} ${sqlType(c, dialect)}`;
    if (!c.nullable) sql += ` NOT NULL DEFAULT ${sqlDefault(c)}`;
    out.push(sql);
  }
  return out;
}
