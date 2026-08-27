/**
 * Backbone Blueprint — the intermediate representation produced by the analyzer and
 * consumed by the generators. It is the single contract between "reading the frontend"
 * and "writing the backend". Everything here is plain, serialisable data: no behaviour,
 * no AI, no ambiguity. Equivalent frontends must produce an equivalent Blueprint.
 */

/** The current Blueprint schema version. Bump on breaking shape changes. */
export const BLUEPRINT_VERSION = 1 as const;

/**
 * A pointer back to the frontend source that produced a Blueprint node. Every detected
 * node carries at least one, so the UI and GENERATION_REPORT.md can trace
 * frontend-requirement -> backend-component.
 */
export interface SourceRef {
  /** Frontend-relative file path, POSIX separators, e.g. "src/models/task.ts". */
  file: string;
  /** 1-based line number the node was detected on. */
  line: number;
  /** Short human note, e.g. "interface Task" or "api.post('/tasks')". */
  note?: string;
}

/** Primitive field types the analyzer maps TS types down to. */
export type PrimitiveType =
  | "string"
  | "int"
  | "float"
  | "boolean"
  | "datetime"
  | "enum"
  | "uuid"
  | "json";

export interface EntityField {
  name: string;
  type: PrimitiveType;
  /** True if the TS field was optional (`?`) or unioned with null/undefined. */
  nullable: boolean;
  /** Present iff type === "enum": the string-literal union members. */
  enumValues?: string[];
  /**
   * Present iff this scalar field is a foreign key (e.g. `projectId`). Names the
   * target entity. The relation is also recorded on `Entity.relations`.
   */
  fkTo?: string;
  /** True for the entity's primary key (detected `id`/`uuid`, or synthesised). */
  primaryKey?: boolean;
  sourceRefs: SourceRef[];
}

export type RelationKind = "many-to-one" | "one-to-many" | "many-to-many";

export interface Relation {
  kind: RelationKind;
  /** Target entity name. */
  target: string;
  /** Foreign-key column, on this side for many-to-one, on the target for one-to-many. */
  fk?: string;
  /** For many-to-many: the join table name (deterministic, alphabetical). */
  joinTable?: string;
  /** The field on this entity that produced the relation. */
  via?: string;
  sourceRefs: SourceRef[];
}

export interface Entity {
  name: string;
  /** Plural, lower-snake table name, e.g. "tasks". Deterministic from `name`. */
  table: string;
  fields: EntityField[];
  relations: Relation[];
  /** UI toggle — when false the generators skip this entity. Defaults true. */
  generate: boolean;
  sourceRefs: SourceRef[];
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type CrudOperation = "list" | "read" | "create" | "update" | "delete" | "custom";

export interface EndpointAuth {
  required: boolean;
  /** Role names required, if any were detected/declared. */
  roles?: string[];
}

export interface Endpoint {
  method: HttpMethod;
  /** Path pattern with `:param` placeholders, e.g. "/projects/:id/tasks". */
  path: string;
  operation: CrudOperation;
  /** Entity this endpoint operates on, if resolvable. */
  entity?: string;
  /** TS type name of the request payload, if any. */
  requestType?: string;
  /** TS type name of the response payload, if any. */
  responseType?: string;
  auth: EndpointAuth;
  /** UI toggle — when false the generators skip this endpoint. Defaults true. */
  generate: boolean;
  sourceRefs: SourceRef[];
}

export type SqlDialect = "sqlite" | "mysql";

export interface Datastore {
  /** True iff any generated entity is backed by a persisted operation. */
  required: boolean;
  dialect: SqlDialect;
}

export interface AuthConfig {
  /** True iff a login/register call or bearer-token usage was detected. */
  required: boolean;
  /** All role names seen across endpoints, for the role guard + users seed. */
  roles: string[];
}

export interface BlueprintMeta {
  /** Frontend path the Blueprint was analysed from (absolute at analyse time). */
  frontendPath: string;
  /** ISO timestamp, stamped by the caller (analyzer/CLI), not inside pure helpers. */
  generatedAt?: string;
  /** Analyzer version string. */
  analyzer?: string;
}

export interface Blueprint {
  version: typeof BLUEPRINT_VERSION;
  meta: BlueprintMeta;
  entities: Entity[];
  endpoints: Endpoint[];
  auth: AuthConfig;
  datastore: Datastore;
  /** Non-fatal notes surfaced during analysis (ambiguities, skipped nodes). */
  notes: string[];
}

/** Target runtime for generation. */
export type Runtime = "node" | "php" | "python";

/**
 * Architecture / framework preset. For Node this is a code layout (layered / modular); for
 * Python it selects the web framework (fastapi / django). The runtime × architecture pair
 * resolves to exactly one template set.
 */
export type Architecture = "layered" | "modular" | "fastapi" | "django";

export interface GenerateOptions {
  runtime: Runtime;
  architecture: Architecture;
  /** Output directory (absolute). */
  outDir: string;
  dialect?: SqlDialect;
}
