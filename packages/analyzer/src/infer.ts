import {
  singularize,
  tableName,
  toPascalCase,
  toSnakeCase,
  type Entity,
  type EntityField,
  type PrimitiveType,
} from "@backbone/core";
import type { RawEndpoint } from "./endpoints.js";

/**
 * Fallback entity inference for frontends with no type declarations (plain JavaScript, or a
 * component framework where models live only in API shapes). When the TypeScript-interface path
 * finds nothing, we derive a coarse but deterministic entity per REST resource, so the generator
 * still produces tables + CRUD rather than an empty backend.
 *
 * Rules (deterministic):
 *   - Group non-auth endpoints by their resource — the first static path segment (a leading
 *     `api`/`v1`/`v2` prefix is skipped).
 *   - Entity name = PascalCase(singular(resource)); table = pluralised snake.
 *   - Fields = a synthetic `id` primary key plus the union of object-literal request-body property
 *     names seen posting to that resource. Body fields are plain scalars (no FKs, to avoid
 *     dangling references), so the Blueprint always validates.
 *
 * This is intentionally conservative and clearly noted in the Blueprint so the user can refine it
 * (add TS interfaces or a `backbone.manifest`).
 */

/** Path segments that are namespaces/versions, not resources. */
const SKIP_SEGMENTS = new Set(["api", "v1", "v2", "v3", "v4"]);
/** First segments that are endpoints/actions but not persistable resources. */
const NON_RESOURCE = new Set([
  "error", "errors", "health", "healthz", "ping", "status", "ready", "live",
  "join", "search", "callback", "upload", "download", "refresh", "verify", "me", "logout",
]);

export function inferEntitiesFromEndpoints(raw: RawEndpoint[]): Entity[] {
  // resource key → the endpoints and body fields contributing to it.
  const groups = new Map<string, { seg: string; bodyFields: Map<string, PrimitiveType>; ref: RawEndpoint }>();

  for (const ep of raw) {
    if (ep.isAuthRoute) continue;
    const seg = resourceSegment(ep.path);
    if (!seg) continue;
    const key = toSnakeCase(singularize(seg));
    if (!key || NON_RESOURCE.has(seg.toLowerCase())) continue;

    let g = groups.get(key);
    if (!g) {
      g = { seg, bodyFields: new Map(), ref: ep };
      groups.set(key, g);
    }
    for (const f of ep.bodyFields ?? []) {
      const fname = toSnakeCase(f.name);
      if (fname === "id" || fname === "_id") continue;
      if (!g.bodyFields.has(fname)) g.bodyFields.set(f.name, f.type);
    }
  }

  const entities: Entity[] = [];
  for (const [, g] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const name = toPascalCase(singularize(g.seg));
    if (!name) continue;
    const fields: EntityField[] = [idField(g.ref)];
    for (const [fname, ftype] of g.bodyFields) {
      fields.push({
        name: fname,
        type: ftype,
        nullable: false,
        sourceRefs: g.ref.sourceRefs.slice(0, 1),
      });
    }
    entities.push({
      name,
      table: tableName(name),
      fields,
      relations: [],
      generate: true,
      sourceRefs: g.ref.sourceRefs.slice(0, 1),
    });
  }
  return entities;
}

/** The resource segment of a path: the first static (non-`:param`) segment past any api/vN prefix. */
function resourceSegment(path: string): string | null {
  const segs = path.split("/").filter((s) => s && !s.startsWith(":"));
  for (const s of segs) {
    if (SKIP_SEGMENTS.has(s.toLowerCase())) continue;
    return s;
  }
  return null;
}

function idField(ref: RawEndpoint): EntityField {
  return {
    name: "id",
    type: "int",
    nullable: false,
    primaryKey: true,
    sourceRefs: ref.sourceRefs.slice(0, 1),
  };
}
