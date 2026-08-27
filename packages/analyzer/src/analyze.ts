import {
  canonicalizeBlueprint,
  emptyBlueprint,
  singularize,
  tableName,
  toPascalCase,
  toSnakeCase,
  type Blueprint,
  type Endpoint,
  type Entity,
} from "@backbone/core";
import { loadFrontend } from "./project.js";
import { collectDeclarations, draftEntity } from "./entities.js";
import { collectEndpoints, type RawEndpoint } from "./endpoints.js";
import { buildEntities } from "./relations.js";
import { applyManifest, loadManifest } from "./manifest.js";

export const ANALYZER_VERSION = "0.1.0";

/** Names ending in these are treated as DTOs, not entities, unless dir/tag says otherwise. */
const DTO_SUFFIX = /(Request|Response|Payload|Dto|DTO|Props|State|Params|Config|Options|Args|Input|Result)$/;

export interface AnalyzeResult {
  blueprint: Blueprint;
}

/**
 * Analyse a React+TS frontend into a Blueprint. Pure detection: syntactic ts-morph
 * analysis + fixed rules, no type-checking of node_modules and no AI.
 */
export function analyzeFrontend(frontendPath: string): Blueprint {
  const { project, root } = loadFrontend(frontendPath);
  const notes: string[] = [];

  const declarations = collectDeclarations(project, root);
  const knownTypeNames = new Set(declarations.keys());
  const rawEndpoints = collectEndpoints(project, root);

  // Types referenced as request/response payloads of a detected call become entities.
  const referenced = new Set<string>();
  for (const ep of rawEndpoints) {
    if (ep.responseType && knownTypeNames.has(ep.responseType)) referenced.add(ep.responseType);
    if (ep.requestType && knownTypeNames.has(ep.requestType)) referenced.add(ep.requestType);
  }

  // Decide the entity set from the three detection sources.
  const entityDecls = [...declarations.values()].filter((d) => {
    if (d.isEntityDir || d.hasEntityTag) return true;
    if (referenced.has(d.name) && !DTO_SUFFIX.test(d.name)) return true;
    return false;
  });
  const entityNames = new Set(entityDecls.map((d) => d.name));

  const drafts = entityDecls.map((d) => draftEntity(d, knownTypeNames, root));
  let entities = buildEntities(drafts, entityNames);

  const roles = collectRoles(entities);
  const endpoints = associateEndpoints(rawEndpoints, entities);

  // Auth is required if a login/register call exists or any call carries a token.
  const authRoutes = rawEndpoints.filter((e) => e.isAuthRoute);
  const anyTokenBearing = rawEndpoints.some((e) => e.authProtected);
  const authRequired = authRoutes.length > 0 || anyTokenBearing;
  if (authRoutes.length > 0) {
    notes.push(`Auth detected from ${authRoutes.length} auth route(s); register/login/me generated.`);
  }

  // Datastore is required only when a persisted operation exists.
  const persisted = endpoints.some(
    (ep) => ep.entity && ["list", "read", "create", "update", "delete"].includes(ep.operation),
  );
  const datastoreRequired = persisted || entities.length > 0;

  let bp: Blueprint = {
    ...emptyBlueprint(root),
    meta: { frontendPath: root, analyzer: ANALYZER_VERSION },
    entities,
    endpoints,
    auth: { required: authRequired, roles },
    datastore: { required: datastoreRequired, dialect: "sqlite" },
    notes: [...notes, ...describeCoverage(entities, endpoints)],
  };

  bp = applyManifest(bp, loadManifest(root));
  return canonicalizeBlueprint(bp);
}

/** Associate endpoints to entities by payload type, then by path segment. */
function associateEndpoints(raw: RawEndpoint[], entities: Entity[]): Endpoint[] {
  const byName = new Map(entities.map((e) => [e.name, e]));
  const byTable = new Map(entities.map((e) => [e.table, e]));
  const bySingular = new Map(entities.map((e) => [toSnakeCase(e.name), e]));

  const out: Endpoint[] = [];
  for (const ep of raw) {
    if (ep.isAuthRoute) continue; // handled by the fixed auth templates

    let entity: string | undefined;
    if (ep.responseType && byName.has(ep.responseType)) entity = ep.responseType;
    else if (ep.requestType && byName.has(ep.requestType)) entity = ep.requestType;
    else entity = matchByPath(ep.path, byTable, bySingular);

    out.push({
      method: ep.method,
      path: ep.path,
      operation: ep.operation,
      entity,
      requestType: ep.requestType,
      responseType: ep.responseType,
      auth: { required: ep.authProtected },
      generate: true,
      sourceRefs: ep.sourceRefs,
    });
  }
  return out;
}

function matchByPath(
  path: string,
  byTable: Map<string, Entity>,
  bySingular: Map<string, Entity>,
): string | undefined {
  const segments = path.split("/").filter((s) => s && !s.startsWith(":"));
  // Prefer the last resource-looking segment (closest to the operated resource).
  for (const seg of [...segments].reverse()) {
    const key = toSnakeCase(seg);
    if (byTable.has(key)) return byTable.get(key)!.name;
    const sing = toSnakeCase(singularize(seg));
    if (bySingular.has(sing)) return bySingular.get(sing)!.name;
    if (byTable.has(tableName(toPascalCase(sing)))) return byTable.get(tableName(toPascalCase(sing)))!.name;
  }
  return undefined;
}

/** Roles come from an enum field named role/roles on any entity. */
function collectRoles(entities: Entity[]): string[] {
  const roles = new Set<string>();
  for (const e of entities) {
    for (const f of e.fields) {
      if ((f.name === "role" || f.name === "roles") && f.type === "enum" && f.enumValues) {
        f.enumValues.forEach((v) => roles.add(v));
      }
    }
  }
  return [...roles].sort();
}

function describeCoverage(entities: Entity[], endpoints: Endpoint[]): string[] {
  const notes: string[] = [];
  for (const e of entities) {
    const eps = endpoints.filter((ep) => ep.entity === e.name);
    if (eps.length === 0) {
      notes.push(`Entity ${e.name} has no detected endpoints; table generated for relations/storage.`);
    }
  }
  return notes;
}
