import { file } from "../render.js";
import { toCamelCase, toPascalCase, toSnakeCase } from "../helpers.js";
import type { BlueprintView, ColumnView, EntityView } from "../helpers.js";
import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

/**
 * NestJS template set.
 *
 *  - `nestjs / mvc` — the idiomatic Nest layout: a root `AppModule` (written once, yours to
 *    extend) imports a fully generated `GeneratedModule` that lives under the owned
 *    `src/generated/` boundary. Each entity becomes a self-contained Nest feature module
 *    (entity + DTOs + service + controller + module) under `src/generated/<varName>/`, wired
 *    together by TypeORM.
 *
 * Stack: NestJS 10 + TypeORM 0.3 + better-sqlite3, class-validator/class-transformer DTOs and
 * @nestjs/jwt for authentication. The TypeORM DataSource runs with `synchronize: true`, so the
 * SQLite schema is auto-created from the entity metadata on boot — there is therefore no
 * migration file to emit (see `migration()` below), and the README documents how to switch to
 * real migrations for production. Fully deterministic: no clocks, randomness or network.
 */

const DIR = "node-nest";
const G = "src/generated"; // the owned boundary

/** NestJS · MVC — the idiomatic default (and only) architecture for this framework. */
const nestMvc: Preset = {
  id: "nestjs-mvc",
  runtime: "node",
  framework: "nestjs",
  architecture: "mvc",
  templateDir: DIR,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth, nest };

    // --- Project root (write-once, user-owned) -------------------------------------------
    // Manifests, config and the Nest bootstrap live OUTSIDE the generated boundary so the
    // developer can freely edit them; they are only ever written when absent.
    files.push(file("package.json", DIR, "root/package.json.ejs", data, "once"));
    files.push(file("tsconfig.json", DIR, "root/tsconfig.json.ejs", data, "once"));
    files.push(file("tsconfig.build.json", DIR, "root/tsconfig.build.json.ejs", data, "once"));
    files.push(file("nest-cli.json", DIR, "root/nest-cli.json.ejs", data, "once"));
    files.push(file(".env.example", DIR, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", DIR, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", DIR, "root/README.md.ejs", data, "once"));
    files.push(file("src/main.ts", DIR, "src/main.ts.ejs", data, "once"));
    files.push(file("src/app.module.ts", DIR, "src/app.module.ts.ejs", data, "once"));

    // --- Owned boundary: the root generated module ---------------------------------------
    // Configures the TypeORM DataSource and aggregates every per-entity feature module (plus
    // the AuthModule when the Blueprint requires authentication).
    files.push(file(`${G}/generated.module.ts`, DIR, "generated/generated.module.ts.ejs", data, "owned"));

    // --- Owned boundary: per-entity feature modules --------------------------------------
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth, nest };
      const base = `${G}/${e.varName}`;
      files.push(file(`${base}/${e.varName}.entity.ts`, DIR, "generated/entity/entity.ts.ejs", d, "owned"));
      files.push(file(`${base}/dto/create-${e.varName}.dto.ts`, DIR, "generated/entity/dto/create.dto.ts.ejs", d, "owned"));
      files.push(file(`${base}/dto/update-${e.varName}.dto.ts`, DIR, "generated/entity/dto/update.dto.ts.ejs", d, "owned"));
      files.push(file(`${base}/${e.varName}.service.ts`, DIR, "generated/entity/service.ts.ejs", d, "owned"));
      files.push(file(`${base}/${e.varName}.controller.ts`, DIR, "generated/entity/controller.ts.ejs", d, "owned"));
      files.push(file(`${base}/${e.varName}.module.ts`, DIR, "generated/entity/module.ts.ejs", d, "owned"));
    }

    // --- Owned boundary: authentication --------------------------------------------------
    // Only emitted when the Blueprint declares auth. Provides a JWT register/login/me flow
    // over a reserved `users` table plus a guard that protects endpoints marked auth: true.
    if (view.hasAuth) {
      files.push(file(`${G}/auth/user.entity.ts`, DIR, "generated/auth/user.entity.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/jwt.guard.ts`, DIR, "generated/auth/jwt.guard.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.service.ts`, DIR, "generated/auth/auth.service.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.controller.ts`, DIR, "generated/auth/auth.controller.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/auth.module.ts`, DIR, "generated/auth/auth.module.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/dto/register.dto.ts`, DIR, "generated/auth/dto/register.dto.ts.ejs", data, "owned"));
      files.push(file(`${G}/auth/dto/login.dto.ts`, DIR, "generated/auth/dto/login.dto.ts.ejs", data, "owned"));
    }

    return files;
  },

  /**
   * NestJS + TypeORM runs with `synchronize: true` in development, so the schema is derived
   * from entity metadata at boot and there is no standalone migration file to generate. The
   * README explains how to disable synchronize and adopt TypeORM CLI migrations for production.
   */
  migration(_ctx: GenContext, _plan: MigrationPlan): MigrationFile | null {
    return null;
  },
};

export const nodeNestPresets: Preset[] = [nestMvc];

/* -------------------------------------------------------------------------------------------- *
 * Deterministic NestJS / TypeORM / class-validator code fragments — computed here so the EJS
 * templates stay logic-light. Passed into every render as `nest` (mirrors the `py` object in
 * python-fastapi.ts). No clocks, no randomness: identical Blueprints yield identical strings.
 * -------------------------------------------------------------------------------------------- */
export const nest = {
  /** TypeORM `@Column({ type })` string for a scalar column. */
  ormType(c: ColumnView): string {
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
        // TypeORM's portable JSON type: serialises objects to TEXT on SQLite automatically.
        return "simple-json";
      case "enum":
        // SQLite has no native ENUM; `simple-enum` stores the value as text and validates it.
        return "simple-enum";
      case "uuid":
        return "varchar";
      default:
        return "varchar";
    }
  },

  /**
   * The full TypeORM column decorator for a single field, honouring primary keys, the
   * framework-managed timestamp columns (`created_at` / `updated_at`) and enums.
   */
  columnDecorator(c: ColumnView): string {
    if (c.primaryKey) {
      // Auto-generated primary key: a UUID string or an auto-increment integer.
      return c.type === "uuid"
        ? `@PrimaryGeneratedColumn("uuid", { name: ${JSON.stringify(c.name)} })`
        : `@PrimaryGeneratedColumn({ name: ${JSON.stringify(c.name)} })`;
    }
    if (c.name === "created_at") {
      return `@CreateDateColumn({ name: ${JSON.stringify(c.name)} })`;
    }
    if (c.name === "updated_at") {
      return `@UpdateDateColumn({ name: ${JSON.stringify(c.name)} })`;
    }
    if (c.type === "enum") {
      const vals = (c.enumValues ?? []).map((v) => JSON.stringify(v)).join(", ");
      return `@Column({ name: ${JSON.stringify(c.name)}, type: "simple-enum", enum: [${vals}], nullable: ${c.nullable} })`;
    }
    return `@Column({ name: ${JSON.stringify(c.name)}, type: ${JSON.stringify(this.ormType(c))}, nullable: ${c.nullable} })`;
  },

  /** Which `typeorm` decorators the entity file must import, given its columns and relations. */
  entityImports(e: EntityView, view: BlueprintView): string[] {
    const set = new Set<string>(["Entity"]);
    for (const c of e.columns) {
      if (c.primaryKey) set.add("PrimaryGeneratedColumn");
      else if (c.name === "created_at") set.add("CreateDateColumn");
      else if (c.name === "updated_at") set.add("UpdateDateColumn");
      else set.add("Column");
    }
    for (const d of this.relations(e, view)) {
      for (const dec of d.decorators) set.add(dec);
    }
    return [...set].sort();
  },

  /**
   * Resolve the TypeORM relation properties for an entity. Only relations whose target is a
   * generated entity are emitted (a User folded into the auth `users` table has no entity file).
   * Returns, per relation, the code block, the decorators it needs and the sibling entity it
   * imports, so the template can wire imports without any logic of its own.
   */
  relations(e: EntityView, view: BlueprintView): Array<{
    kind: string;
    targetClass: string;
    targetVar: string;
    prop: string;
    code: string;
    decorators: string[];
  }> {
    const names = new Set(view.entities.map((x) => x.name));
    const out: Array<{
      kind: string;
      targetClass: string;
      targetVar: string;
      prop: string;
      code: string;
      decorators: string[];
    }> = [];
    for (const r of e.relations) {
      if (!names.has(r.target)) continue; // skip relations to non-generated targets (e.g. users)
      const targetClass = toPascalCase(r.target);
      const targetVar = toCamelCase(r.target);
      if (r.kind === "many-to-one") {
        // Owning side: the foreign-key column lives on THIS table. `@JoinColumn` binds the
        // relation to the existing snake_case FK column so no duplicate column is created.
        const fkCol = this.manyToOneFkColumn(e, r, targetVar);
        const prop = targetVar;
        const code = [
          `  // Many ${e.name} rows reference one ${r.target} (foreign key \`${fkCol}\`).`,
          `  @ManyToOne(() => ${targetClass})`,
          `  @JoinColumn({ name: ${JSON.stringify(fkCol)} })`,
          `  ${prop}?: ${targetClass};`,
        ].join("\n");
        out.push({ kind: r.kind, targetClass, targetVar, prop, code, decorators: ["ManyToOne", "JoinColumn"] });
      } else if (r.kind === "one-to-many") {
        // Inverse side: one ${e.name} owns many ${r.target}. The inverse arrow assumes the
        // target's owning @ManyToOne property is named after this entity (`${e.varName}`).
        const prop = `${targetVar}s`;
        const code = [
          `  // One ${e.name} owns many ${r.target} rows.`,
          `  @OneToMany(() => ${targetClass}, (row) => row.${e.varName})`,
          `  ${prop}?: ${targetClass}[];`,
        ].join("\n");
        out.push({ kind: r.kind, targetClass, targetVar, prop, code, decorators: ["OneToMany"] });
      } else if (r.kind === "many-to-many") {
        // Many-to-many across the join table `${r.joinTable}`. Only the alphabetically-first
        // side owns the relation and carries `@JoinTable`, so the join table is defined once.
        const join = view.joinTables.find((j) => j.name === r.joinTable);
        const owner = join ? join.left === e.table : true;
        const prop = `${targetVar}s`;
        const decorators = owner ? ["ManyToMany", "JoinTable"] : ["ManyToMany"];
        const lines = [
          `  // Many ${e.name} rows relate to many ${r.target} rows via \`${r.joinTable}\`.`,
          `  @ManyToMany(() => ${targetClass})`,
        ];
        if (owner) lines.push(`  @JoinTable({ name: ${JSON.stringify(r.joinTable)} })`);
        lines.push(`  ${prop}?: ${targetClass}[];`);
        out.push({ kind: r.kind, targetClass, targetVar, prop, code: lines.join("\n"), decorators });
      }
    }
    return out;
  },

  /** The snake_case FK column backing a many-to-one relation. */
  manyToOneFkColumn(e: EntityView, r: { fk?: string; via?: string; target: string }, targetVar: string): string {
    const byFk = e.columns.find((c) => c.fkTo === r.target);
    if (byFk) return byFk.name;
    if (r.fk) return toSnakeCase(r.fk);
    return `${toSnakeCase(targetVar)}_id`;
  },

  /** Sibling entity imports (deduped) an entity file needs for its relation targets. */
  relationTargets(e: EntityView, view: BlueprintView): Array<{ varName: string; className: string }> {
    const seen = new Map<string, string>();
    for (const r of this.relations(e, view)) {
      seen.set(r.targetVar, r.targetClass);
    }
    return [...seen.entries()]
      .map(([varName, className]) => ({ varName, className }))
      .filter((t) => t.varName !== e.varName)
      .sort((a, b) => a.varName.localeCompare(b.varName));
  },

  /** The class-validator decorator lines for one writable DTO column. */
  validators(c: ColumnView): string[] {
    const d: string[] = [];
    // Nullable/optional Blueprint fields become optional DTO fields.
    if (c.nullable) d.push("@IsOptional()");
    switch (c.type) {
      case "int":
        d.push("@IsInt()");
        break;
      case "float":
        d.push("@IsNumber()");
        break;
      case "boolean":
        d.push("@IsBoolean()");
        break;
      case "datetime":
        d.push("@IsDateString()");
        break;
      case "uuid":
        d.push("@IsUUID()");
        break;
      case "enum":
        d.push(`@IsIn([${(c.enumValues ?? []).map((v) => JSON.stringify(v)).join(", ")}])`);
        break;
      case "json":
        d.push("@IsObject()");
        break;
      default:
        d.push("@IsString()");
    }
    return d;
  },

  /** Which `class-validator` decorators a DTO must import for the given columns. */
  validatorImports(cols: ColumnView[]): string[] {
    const set = new Set<string>();
    for (const c of cols) {
      if (c.nullable) set.add("IsOptional");
      switch (c.type) {
        case "int":
          set.add("IsInt");
          break;
        case "float":
          set.add("IsNumber");
          break;
        case "boolean":
          set.add("IsBoolean");
          break;
        case "datetime":
          set.add("IsDateString");
          break;
        case "uuid":
          set.add("IsUUID");
          break;
        case "enum":
          set.add("IsIn");
          break;
        case "json":
          set.add("IsObject");
          break;
        default:
          set.add("IsString");
      }
    }
    return [...set].sort();
  },

  /** The Nest HTTP-method decorator for a Blueprint endpoint (`GET` -> `Get`, ...). */
  methodDecorator(method: string): string {
    const m = method.toUpperCase();
    if (m === "GET") return "Get";
    if (m === "POST") return "Post";
    if (m === "PUT") return "Put";
    if (m === "PATCH") return "Patch";
    if (m === "DELETE") return "Delete";
    return "All";
  },

  /**
   * The controller method path RELATIVE to the `@Controller(routeBase)` prefix. Nest joins the
   * two, so `/tasks/:id` under base `/tasks` becomes `":id"`, and `/tasks` becomes `""`.
   */
  methodPath(httpPath: string, routeBase: string): string {
    let rest = httpPath;
    if (rest.startsWith(routeBase)) rest = rest.slice(routeBase.length);
    rest = rest.replace(/^\/+/, "");
    return rest;
  },

  /** The Nest controller method name for a Blueprint handler (index/show/store/update/destroy). */
  handlerMethod(handler: string): string {
    switch (handler) {
      case "index":
        return "findAll";
      case "show":
        return "findOne";
      case "store":
        return "create";
      case "update":
        return "update";
      case "destroy":
        return "remove";
      default:
        return handler;
    }
  },
};
