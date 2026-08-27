import {
  BLUEPRINT_VERSION,
  type Blueprint,
  type Entity,
  type Endpoint,
  type EntityField,
  type PrimitiveType,
} from "./types.js";

/** A fresh, empty Blueprint. `frontendPath` is recorded verbatim. */
export function emptyBlueprint(frontendPath: string): Blueprint {
  return {
    version: BLUEPRINT_VERSION,
    meta: { frontendPath },
    entities: [],
    endpoints: [],
    auth: { required: false, roles: [] },
    datastore: { required: false, dialect: "sqlite" },
    notes: [],
  };
}

/**
 * Canonicalise a Blueprint into a stable, deterministic ordering so that equivalent
 * frontends serialise byte-identically and diffs are meaningful. Sorts entities,
 * fields, relations, endpoints, roles, and notes; does not mutate the input.
 */
export function canonicalizeBlueprint(bp: Blueprint): Blueprint {
  const entities = [...bp.entities]
    .map((e) => ({
      ...e,
      fields: sortFields(e.fields),
      relations: [...e.relations].sort(
        (a, b) => a.kind.localeCompare(b.kind) || a.target.localeCompare(b.target),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const endpoints = [...bp.endpoints].sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      methodOrder(a.method) - methodOrder(b.method),
  );

  return {
    ...bp,
    entities,
    endpoints,
    auth: { ...bp.auth, roles: [...bp.auth.roles].sort() },
    notes: [...bp.notes].sort(),
  };
}

/** Primary key first, then foreign keys, then the rest alphabetically. */
function sortFields(fields: EntityField[]): EntityField[] {
  return [...fields].sort((a, b) => {
    const rank = (f: EntityField) => (f.primaryKey ? 0 : f.fkTo ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

function methodOrder(m: string): number {
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].indexOf(m);
}

/** Serialise to canonical, stable JSON (2-space indent, sorted). */
export function serializeBlueprint(bp: Blueprint): string {
  return JSON.stringify(canonicalizeBlueprint(bp), null, 2) + "\n";
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const PRIMITIVES: PrimitiveType[] = [
  "string",
  "int",
  "float",
  "boolean",
  "datetime",
  "enum",
  "uuid",
  "json",
];

/**
 * Structural + referential validation. Returns every issue found (empty array = valid).
 * Checks shape, enum consistency, unique names, and that relations/FKs point at real
 * entities. Deterministic and dependency-free.
 */
export function validateBlueprint(bp: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const b = bp as Blueprint;

  if (!b || typeof b !== "object") {
    return [{ path: "$", message: "Blueprint must be an object." }];
  }
  if (b.version !== BLUEPRINT_VERSION) {
    issues.push({
      path: "version",
      message: `Expected version ${BLUEPRINT_VERSION}, got ${String(b.version)}.`,
    });
  }
  if (!Array.isArray(b.entities)) issues.push({ path: "entities", message: "Must be an array." });
  if (!Array.isArray(b.endpoints)) issues.push({ path: "endpoints", message: "Must be an array." });

  const entityNames = new Set<string>();
  (b.entities ?? []).forEach((e, i) => validateEntity(e, i, entityNames, issues));

  // Referential integrity: relations and FKs must target known entities.
  (b.entities ?? []).forEach((e, i) => {
    e.relations?.forEach((r, j) => {
      if (!entityNames.has(r.target)) {
        issues.push({
          path: `entities[${i}].relations[${j}].target`,
          message: `Relation targets unknown entity "${r.target}".`,
        });
      }
    });
    e.fields?.forEach((f, j) => {
      if (f.fkTo && !entityNames.has(f.fkTo)) {
        issues.push({
          path: `entities[${i}].fields[${j}].fkTo`,
          message: `Foreign key targets unknown entity "${f.fkTo}".`,
        });
      }
    });
  });

  (b.endpoints ?? []).forEach((ep, i) => validateEndpoint(ep, i, entityNames, issues));

  return issues;
}

function validateEntity(
  e: Entity,
  i: number,
  names: Set<string>,
  issues: ValidationIssue[],
): void {
  const at = `entities[${i}]`;
  if (!e.name || typeof e.name !== "string") {
    issues.push({ path: `${at}.name`, message: "Entity requires a non-empty name." });
    return;
  }
  if (names.has(e.name)) {
    issues.push({ path: `${at}.name`, message: `Duplicate entity name "${e.name}".` });
  }
  names.add(e.name);

  const fieldNames = new Set<string>();
  (e.fields ?? []).forEach((f, j) => {
    const fat = `${at}.fields[${j}]`;
    if (!f.name) issues.push({ path: `${fat}.name`, message: "Field requires a name." });
    if (fieldNames.has(f.name)) {
      issues.push({ path: `${fat}.name`, message: `Duplicate field "${f.name}".` });
    }
    fieldNames.add(f.name);
    if (!PRIMITIVES.includes(f.type)) {
      issues.push({ path: `${fat}.type`, message: `Unknown field type "${f.type}".` });
    }
    if (f.type === "enum" && (!f.enumValues || f.enumValues.length === 0)) {
      issues.push({ path: `${fat}.enumValues`, message: "Enum field needs enumValues." });
    }
  });
}

function validateEndpoint(
  ep: Endpoint,
  i: number,
  entityNames: Set<string>,
  issues: ValidationIssue[],
): void {
  const at = `endpoints[${i}]`;
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  if (!methods.includes(ep.method)) {
    issues.push({ path: `${at}.method`, message: `Invalid HTTP method "${ep.method}".` });
  }
  if (!ep.path || !ep.path.startsWith("/")) {
    issues.push({ path: `${at}.path`, message: "Path must start with '/'." });
  }
  if (ep.entity && !entityNames.has(ep.entity)) {
    issues.push({ path: `${at}.entity`, message: `Endpoint references unknown entity "${ep.entity}".` });
  }
}

/** Parse + validate JSON text into a Blueprint, throwing on any issue. */
export function parseBlueprint(text: string): Blueprint {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Blueprint is not valid JSON: ${(err as Error).message}`);
  }
  const issues = validateBlueprint(data);
  if (issues.length > 0) {
    const lines = issues.map((x) => `  - ${x.path}: ${x.message}`).join("\n");
    throw new Error(`Blueprint failed validation:\n${lines}`);
  }
  return data as Blueprint;
}

/** Entities/endpoints the generators will actually emit (toggle honoured). */
export function activeEntities(bp: Blueprint): Entity[] {
  return bp.entities.filter((e) => e.generate);
}
export function activeEndpoints(bp: Blueprint): Endpoint[] {
  const on = new Set(activeEntities(bp).map((e) => e.name));
  return bp.endpoints.filter((ep) => ep.generate && (!ep.entity || on.has(ep.entity)));
}
