import { file } from "../render.js";
import { toCamelCase, toPascalCase, toSnakeCase } from "../helpers.js";
import type { BlueprintView, ColumnView, EntityView } from "../helpers.js";
import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

const DIR = "php-laravel";
const G = "app/Generated"; // the owned boundary — PSR-4 App\Generated\...

/**
 * Laravel 11 + Eloquent, MVC — an idiomatic, recognizable Laravel-style scaffold. This is NOT a
 * full `laravel new`: it emits the framework files a Laravel developer expects (artisan,
 * bootstrap/app.php, public/index.php, config/*), then the generated app code — Eloquent models,
 * API controllers, form requests and migrations. All generated code lives under `app/Generated/`
 * (owned, overwritten on every regenerate) so regeneration never clobbers hand-written user code;
 * a handful of thin, write-once files wire it up. Deterministic, no AI.
 *
 * The JSON API is snake_case (the native Eloquent attribute casing) — clean, idiomatic and
 * runnable without a case-mapping layer.
 */
const laravelMvc: Preset = {
  id: "laravel-mvc",
  runtime: "php",
  framework: "laravel",
  architecture: "mvc",
  templateDir: DIR,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth, lv };

    // --- Project root & framework bootstrap (write-once, user-owned) ---
    files.push(file("composer.json", DIR, "root/composer.json.ejs", data, "once"));
    files.push(file(".env.example", DIR, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", DIR, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", DIR, "root/README.md.ejs", data, "once"));
    files.push(file("artisan", DIR, "root/artisan.ejs", data, "once", true));
    files.push(file("bootstrap/app.php", DIR, "bootstrap/app.php.ejs", data, "once"));
    files.push(file("bootstrap/providers.php", DIR, "bootstrap/providers.php.ejs", data, "once"));
    files.push(file("public/index.php", DIR, "public/index.php.ejs", data, "once"));
    files.push(file("config/app.php", DIR, "config/app.php.ejs", data, "once"));
    files.push(file("config/database.php", DIR, "config/database.php.ejs", data, "once"));
    files.push(file("routes/console.php", DIR, "routes/console.php.ejs", data, "once"));

    // --- routes/api.php is OWNED: it is regenerated to match the current Blueprint. ---
    files.push(file("routes/api.php", DIR, "routes/api.php.ejs", data, "owned"));

    // --- Owned boundary: per-entity Eloquent model + controller + form requests. ---
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth, lv };
      files.push(file(`${G}/Models/${e.className}.php`, DIR, "generated/Models/model.php.ejs", d, "owned"));
      files.push(file(`${G}/Http/Controllers/${e.className}Controller.php`, DIR, "generated/Http/Controllers/controller.php.ejs", d, "owned"));
      files.push(file(`${G}/Http/Requests/Store${e.className}Request.php`, DIR, "generated/Http/Requests/store-request.php.ejs", d, "owned"));
      files.push(file(`${G}/Http/Requests/Update${e.className}Request.php`, DIR, "generated/Http/Requests/update-request.php.ejs", d, "owned"));
    }

    // --- Owned boundary: authentication (only when the Blueprint requires it). ---
    if (view.hasAuth) {
      files.push(file(`${G}/Models/User.php`, DIR, "generated/Models/user.php.ejs", data, "owned"));
      files.push(file(`${G}/Http/Controllers/AuthController.php`, DIR, "generated/Http/Controllers/auth-controller.php.ejs", data, "owned"));
    }

    // --- Owned boundary: one Laravel migration class per table, deterministically ordered. ---
    for (const m of migrationFiles(view)) {
      files.push(file(`database/migrations/${m.filename}`, DIR, m.template, m.data, "owned"));
    }

    return files;
  },

  // Laravel owns schema evolution through its own migration tooling (`php artisan migrate`).
  // The migration *classes* are emitted as owned files in build() above, so there is no single
  // pipeline migration to render here.
  migration(_ctx: GenContext, _plan: MigrationPlan): MigrationFile | null {
    return null;
  },
};

export const phpLaravelPresets: Preset[] = [laravelMvc];

/* ------------------------------------------------------------------ *
 * Deterministic migration file planning — one Laravel migration class
 * per table, ordered so referenced tables are created first.
 * ------------------------------------------------------------------ */

interface PlannedMigration {
  filename: string;
  template: string;
  data: Record<string, unknown>;
}

/** Left-pad a sequence number to 6 digits (the time component of the filename). */
function pad6(n: number): string {
  return String(n).padStart(6, "0");
}

/**
 * Topologically order entities so a table that owns a foreign key is created *after* the table
 * it references — Laravel runs migrations in filename order, and FK constraints need their target
 * table to already exist. Input order is preserved wherever there is no dependency; cycles are
 * broken deterministically by falling back to input order.
 */
function orderEntities(entities: EntityView[]): EntityView[] {
  const byTable = new Map(entities.map((e) => [e.table, e]));
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const result: EntityView[] = [];

  const visit = (e: EntityView): void => {
    if (visited.has(e.table) || onStack.has(e.table)) return;
    onStack.add(e.table);
    for (const c of e.columns) {
      if (c.fkTo && c.fkTable && c.fkTable !== e.table && byTable.has(c.fkTable)) {
        visit(byTable.get(c.fkTable)!);
      }
    }
    onStack.delete(e.table);
    visited.add(e.table);
    result.push(e);
  };

  for (const e of entities) visit(e);
  return result;
}

/**
 * Build the ordered list of migration files. Sequence: the auth `users` table first (so any
 * entity FK to it resolves), then entity tables in dependency order, then many-to-many pivot
 * tables (which reference two already-created tables). Filenames follow Laravel's
 * `0001_01_01_<seq>_create_<table>_table.php` convention and are fully deterministic.
 */
function migrationFiles(view: BlueprintView): PlannedMigration[] {
  const out: PlannedMigration[] = [];
  let seq = 0;

  if (view.hasAuth) {
    out.push({
      filename: `0001_01_01_${pad6(seq++)}_create_users_table.php`,
      template: "database/migrations/users-migration.php.ejs",
      data: { view, lv },
    });
  }

  for (const e of orderEntities(view.entities)) {
    out.push({
      filename: `0001_01_01_${pad6(seq++)}_create_${e.table}_table.php`,
      template: "database/migrations/entity-migration.php.ejs",
      data: { e, view, lv },
    });
  }

  for (const j of view.joinTables) {
    out.push({
      filename: `0001_01_01_${pad6(seq++)}_create_${j.name}_table.php`,
      template: "database/migrations/join-migration.php.ejs",
      data: { j, view, lv },
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * `lv` — deterministic Laravel/Eloquent code fragments, computed here
 * so the EJS templates stay logic-light. Passed into every render.
 * ------------------------------------------------------------------ */

interface ModelRelation {
  /** Eloquent relation method name, e.g. "project" or "tasks". */
  method: string;
  /** Short return type / relation class, e.g. "BelongsTo" — also the import to add. */
  returns: string;
  /** One-line human description for the doc comment. */
  describe: string;
  /** The method body, e.g. `return $this->belongsTo(Project::class, 'project_id');`. */
  body: string;
}

/** PHP string literal, single-quoted and escaped. */
function phpStr(v: string): string {
  return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export const lv = {
  /** Express-style `:id` path params -> Laravel `{id}` (used for prose/comments only). */
  path(httpPath: string): string {
    return httpPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  },

  /** Eloquent `$casts` value for a column, or null when the native string cast is fine. */
  cast(c: ColumnView): string | null {
    switch (c.type) {
      case "int":
        return "integer";
      case "float":
        return "float";
      case "boolean":
        return "boolean";
      case "datetime":
        return "datetime";
      case "json":
        return "array";
      default:
        return null;
    }
  },

  /**
   * A single Schema::create column statement for a normal (non-PK, non-timestamp) column, e.g.
   * `$table->foreignId('project_id')->constrained('projects');`. Nullability and FK constraints
   * are appended in Laravel's fluent style.
   */
  columnLine(c: ColumnView): string {
    let stmt: string;
    const name = phpStr(c.name);
    switch (c.type) {
      case "int":
        stmt = c.fkTo && c.fkTable ? `$table->foreignId(${name})` : `$table->integer(${name})`;
        break;
      case "float":
        stmt = `$table->double(${name})`;
        break;
      case "boolean":
        stmt = `$table->boolean(${name})`;
        break;
      case "datetime":
        stmt = `$table->dateTime(${name})`;
        break;
      case "uuid":
        stmt = `$table->uuid(${name})`;
        break;
      case "enum":
        stmt =
          c.enumValues && c.enumValues.length
            ? `$table->enum(${name}, [${c.enumValues.map(phpStr).join(", ")}])`
            : `$table->string(${name})`;
        break;
      case "json":
        stmt = `$table->json(${name})`;
        break;
      default:
        stmt = `$table->string(${name})`;
    }
    if (c.nullable) stmt += "->nullable()";
    // A many-to-one FK becomes a real constraint against the referenced table's `id`.
    if (c.type === "int" && c.fkTo && c.fkTable) stmt += `->constrained(${phpStr(c.fkTable)})`;
    return stmt + ";";
  },

  /** The full ordered list of Schema::create lines for an entity table. */
  entityMigrationLines(e: EntityView): string[] {
    const names = new Set(e.columns.map((c) => c.name));
    const hasCreated = names.has("created_at");
    const hasUpdated = names.has("updated_at");
    const lines: string[] = [];

    for (const c of e.columns) {
      if (c.name === "created_at" || c.name === "updated_at") continue; // handled below
      if (c.primaryKey) {
        lines.push(
          c.type === "uuid"
            ? `$table->uuid(${phpStr(c.name)})->primary();`
            : c.name === "id"
              ? "$table->id();"
              : `$table->bigIncrements(${phpStr(c.name)});`,
        );
        continue;
      }
      lines.push(this.columnLine(c));
    }

    // Eloquent's managed `created_at`/`updated_at` pair maps to `$table->timestamps()`.
    if (hasCreated && hasUpdated) lines.push("$table->timestamps();");
    else {
      if (hasCreated) lines.push("$table->timestamp('created_at')->nullable();");
      if (hasUpdated) lines.push("$table->timestamp('updated_at')->nullable();");
    }
    return lines;
  },

  /** Schema::create lines for the auth `users` table (auth owns email/password/role). */
  usersMigrationLines(view: BlueprintView): string[] {
    const role = view.auth.roles[0] ?? "member";
    const lines = [
      "$table->id();",
      "$table->string('email')->unique();",
      "$table->string('password_hash');",
      `$table->string('role')->default(${phpStr(role)});`,
    ];
    // Any extra columns detected on the folded User entity are appended verbatim.
    for (const c of view.authUserExtraColumns) lines.push(this.columnLine(c));
    lines.push("$table->timestamps();");
    return lines;
  },

  /** True when the entity carries both timestamp columns (so Eloquent should manage them). */
  usesTimestamps(e: EntityView): boolean {
    const names = new Set(e.columns.map((c) => c.name));
    return names.has("created_at") && names.has("updated_at");
  },

  /**
   * A Laravel validation rule string for one column, e.g. `required|integer` or, for updates,
   * `sometimes|nullable|string`. `partial` (PATCH/PUT) makes every field `sometimes` (optional).
   */
  rule(c: ColumnView, partial: boolean): string {
    const parts: string[] = [];
    if (partial) parts.push("sometimes");
    parts.push(c.nullable ? "nullable" : "required");
    switch (c.type) {
      case "int":
        parts.push("integer");
        break;
      case "float":
        parts.push("numeric");
        break;
      case "boolean":
        parts.push("boolean");
        break;
      case "datetime":
        parts.push("date");
        break;
      case "uuid":
        parts.push("uuid");
        break;
      case "enum":
        parts.push("in:" + (c.enumValues ?? []).join(","));
        break;
      case "json":
        parts.push("array");
        break;
      default:
        parts.push("string");
    }
    return parts.join("|");
  },

  /**
   * Eloquent relation methods for a model, derived from the Blueprint relations. many-to-one ->
   * belongsTo, one-to-many -> hasMany, many-to-many -> belongsToMany. Method names are made
   * unique so no two relations collide.
   */
  modelRelations(e: EntityView): ModelRelation[] {
    const used = new Set<string>();
    const uniq = (base: string): string => {
      let name = base;
      let i = 2;
      while (used.has(name)) name = `${base}${i++}`;
      used.add(name);
      return name;
    };
    const out: ModelRelation[] = [];

    for (const r of e.manyToOne) {
      const target = toPascalCase(r.target);
      const fk = r.fk ?? `${toSnakeCase(r.target)}_id`;
      out.push({
        method: uniq(toCamelCase(r.target)),
        returns: "BelongsTo",
        describe: `The ${r.target} this ${e.name} belongs to (FK ${fk}).`,
        body: `return $this->belongsTo(${target}::class, ${phpStr(fk)});`,
      });
    }
    for (const r of e.oneToMany) {
      const target = toPascalCase(r.target);
      const fk = r.fk ?? `${toSnakeCase(e.name)}_id`;
      out.push({
        method: uniq(`${toCamelCase(r.target)}s`),
        returns: "HasMany",
        describe: `The ${r.target} records that belong to this ${e.name} (FK ${fk}).`,
        body: `return $this->hasMany(${target}::class, ${phpStr(fk)});`,
      });
    }
    for (const r of e.manyToMany) {
      const target = toPascalCase(r.target);
      const join = r.joinTable ?? "";
      const thisFk = `${toSnakeCase(e.name)}_id`;
      const otherFk = `${toSnakeCase(r.target)}_id`;
      out.push({
        method: uniq(`${toCamelCase(r.target)}s`),
        returns: "BelongsToMany",
        describe: `The ${r.target} records linked through the ${join} pivot table.`,
        body: `return $this->belongsToMany(${target}::class, ${phpStr(join)}, ${phpStr(thisFk)}, ${phpStr(otherFk)});`,
      });
    }
    return out;
  },
};
