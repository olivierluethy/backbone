import {
  activeEndpoints,
  activeEntities,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  type Blueprint,
  type Endpoint,
  type Entity,
  type EntityField,
  type Relation,
  type SqlDialect,
} from "@backbone/core";

/**
 * Shared, deterministic helpers: type mappings for SQL / TS / Zod / PHP and entity
 * view-models. Templates consume these so they contain no logic of their own.
 */

/** Columns that the framework manages and that create/update payloads must not include. */
export const MANAGED_COLUMNS = new Set(["id", "created_at", "updated_at", "createdAt", "updatedAt"]);

export interface ColumnView {
  name: string; // snake_case column
  field: string; // original field name (camel)
  type: EntityField["type"];
  nullable: boolean;
  primaryKey: boolean;
  fkTo?: string;
  fkTable?: string;
  enumValues?: string[];
  tsType: string;
  zod: string;
  knex: string; // a knex schema-builder statement fragment
  phpType: string;
}

export interface EntityView {
  name: string;
  table: string;
  className: string;
  varName: string;
  routeBase: string; // "/projects"
  pkType: "int" | "uuid";
  columns: ColumnView[];
  writable: ColumnView[]; // create/update payload columns (no PK/timestamps/managed)
  relations: Relation[];
  manyToOne: Relation[];
  oneToMany: Relation[];
  manyToMany: Relation[];
  endpoints: EndpointView[];
}

export interface EndpointView {
  method: string;
  httpPath: string; // express-style "/projects/:id"
  operation: string;
  auth: boolean;
  handler: string; // controller method name
}

/** Deterministic SQL/knex column fragment for a field. */
export function knexColumn(f: EntityField, dialect: SqlDialect): string {
  const col = toSnakeCase(f.name);
  if (f.primaryKey) {
    return f.type === "uuid"
      ? `table.string("${col}", 36).primary()`
      : `table.increments("${col}")`;
  }
  let base: string;
  switch (f.type) {
    case "int":
      base = f.fkTo ? `table.integer("${col}")` : `table.integer("${col}")`;
      break;
    case "float":
      base = `table.float("${col}")`;
      break;
    case "boolean":
      base = `table.boolean("${col}")`;
      break;
    case "datetime":
      base = `table.dateTime("${col}")`;
      break;
    case "uuid":
      base = `table.string("${col}", 36)`;
      break;
    case "enum":
      // SQLite has no native enum; store as text (validation enforces membership).
      base = `table.string("${col}")`;
      break;
    case "json":
      base = dialect === "sqlite" ? `table.text("${col}")` : `table.json("${col}")`;
      break;
    default:
      base = `table.string("${col}")`;
  }
  if (!f.nullable) base += ".notNullable()";
  else base += ".nullable()";
  return base;
}

export function tsType(f: EntityField): string {
  switch (f.type) {
    case "int":
    case "float":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
    case "uuid":
    case "datetime":
      return "string";
    case "enum":
      return (f.enumValues ?? []).map((v) => JSON.stringify(v)).join(" | ") || "string";
    case "json":
      return "unknown";
    default:
      return "string";
  }
}

export function zodExpr(f: EntityField): string {
  let base: string;
  switch (f.type) {
    case "int":
      base = "z.number().int()";
      break;
    case "float":
      base = "z.number()";
      break;
    case "boolean":
      base = "z.boolean()";
      break;
    case "datetime":
      base = "z.string()";
      break;
    case "uuid":
      base = "z.string().uuid()";
      break;
    case "enum":
      base = `z.enum([${(f.enumValues ?? []).map((v) => JSON.stringify(v)).join(", ")}])`;
      break;
    case "json":
      base = "z.unknown()";
      break;
    default:
      base = "z.string()";
  }
  if (f.nullable) base += ".nullable()";
  return base;
}

export function phpType(f: EntityField): string {
  switch (f.type) {
    case "int":
      return "int";
    case "float":
      return "float";
    case "boolean":
      return "bool";
    case "json":
      return "array";
    default:
      return "string";
  }
}

function columnView(f: EntityField, byName: Map<string, Entity>): ColumnView {
  return {
    name: toSnakeCase(f.name),
    field: f.name,
    type: f.type,
    nullable: f.nullable,
    primaryKey: !!f.primaryKey,
    fkTo: f.fkTo,
    fkTable: f.fkTo ? byName.get(f.fkTo)?.table : undefined,
    enumValues: f.enumValues,
    tsType: tsType(f),
    zod: zodExpr(f),
    knex: "", // filled per-dialect in entityView
    phpType: phpType(f),
  };
}

/** Express-style path is already `:param`; PHP router uses the same convention. */
function handlerName(op: string): string {
  switch (op) {
    case "list":
      return "index";
    case "read":
      return "show";
    case "create":
      return "store";
    case "update":
      return "update";
    case "delete":
      return "destroy";
    default:
      return "handle";
  }
}

export function buildEntityView(
  entity: Entity,
  bp: Blueprint,
  dialect: SqlDialect,
  byName: Map<string, Entity>,
): EntityView {
  const columns = entity.fields.map((f) => {
    const cv = columnView(f, byName);
    cv.knex = knexColumn(f, dialect);
    return cv;
  });
  const writable = columns.filter(
    (c) => !c.primaryKey && !MANAGED_COLUMNS.has(c.name) && !MANAGED_COLUMNS.has(c.field),
  );
  const pk = entity.fields.find((f) => f.primaryKey);
  const endpoints: EndpointView[] = activeEndpoints(bp)
    .filter((ep) => ep.entity === entity.name)
    .map((ep) => ({
      method: ep.method,
      httpPath: ep.path,
      operation: ep.operation,
      auth: ep.auth.required,
      handler: handlerName(ep.operation),
    }));

  return {
    name: entity.name,
    table: entity.table,
    className: toPascalCase(entity.name),
    varName: toCamelCase(entity.name),
    routeBase: `/${entity.table}`,
    pkType: pk?.type === "uuid" ? "uuid" : "int",
    columns,
    writable,
    relations: entity.relations,
    manyToOne: entity.relations.filter((r) => r.kind === "many-to-one"),
    oneToMany: entity.relations.filter((r) => r.kind === "one-to-many"),
    manyToMany: entity.relations.filter((r) => r.kind === "many-to-many"),
    endpoints,
  };
}

export interface BlueprintView {
  entities: EntityView[];
  auth: { required: boolean; roles: string[] };
  dialect: SqlDialect;
  hasAuth: boolean;
  /** Extra columns folded into the auth `users` table from a detected User entity. */
  authUserExtraColumns: ColumnView[];
  /** Unique many-to-many join tables (deduped across both sides). */
  joinTables: Array<{ name: string; left: string; right: string; leftFk: string; rightFk: string }>;
}

/** Columns the auth system owns on `users`; a folded entity's copies of these are dropped. */
const AUTH_RESERVED_COLUMNS = new Set(["id", "email", "role", "password", "password_hash", "created_at", "updated_at"]);

/** Build the full deterministic view of a Blueprint for the templates. */
export function buildBlueprintView(bp: Blueprint, dialect: SqlDialect): BlueprintView {
  const allEntities = activeEntities(bp);
  const byName = new Map(allEntities.map((e) => [e.name, e]));

  // When auth is on, the `users` table belongs to auth. Fold any User entity into it.
  let entities = allEntities;
  let authUserExtraColumns: ColumnView[] = [];
  if (bp.auth.required) {
    const userEntity = allEntities.find((e) => e.table === "users");
    if (userEntity) {
      entities = allEntities.filter((e) => e !== userEntity);
      const uv = buildEntityView(userEntity, bp, dialect, byName);
      authUserExtraColumns = uv.columns.filter((c) => !AUTH_RESERVED_COLUMNS.has(c.name));
    }
  }

  const views = entities.map((e) => buildEntityView(e, bp, dialect, byName));

  const joins = new Map<string, { name: string; left: string; right: string; leftFk: string; rightFk: string }>();
  for (const e of entities) {
    for (const r of e.relations) {
      if (r.kind !== "many-to-many" || !r.joinTable) continue;
      if (joins.has(r.joinTable)) continue;
      const other = byName.get(r.target);
      if (!other) continue;
      const [left, right] = [e.table, other.table].sort();
      const leftName = left === e.table ? e.name : other.name;
      const rightName = right === e.table ? e.name : other.name;
      joins.set(r.joinTable, {
        name: r.joinTable,
        left,
        right,
        leftFk: `${toSnakeCase(leftName)}_id`,
        rightFk: `${toSnakeCase(rightName)}_id`,
      });
    }
  }

  return {
    entities: views,
    auth: bp.auth,
    dialect,
    hasAuth: bp.auth.required,
    authUserExtraColumns,
    joinTables: [...joins.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export { toSnakeCase, toPascalCase, toCamelCase };
export type { Blueprint, Entity, Endpoint, EntityField };
