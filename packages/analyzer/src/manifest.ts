import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import {
  tableName,
  type Blueprint,
  type Entity,
  type EntityField,
  type Endpoint,
} from "@backbone/core";

/**
 * Optional `backbone.manifest.(ts|json)` in the frontend root lets a developer override or
 * augment what the analyzer detects. It is applied deterministically after detection.
 */
export interface ManifestOverride {
  /** Entity names to drop from generation entirely. */
  excludeEntities?: string[];
  /** Endpoint keys ("GET /tasks") to drop. */
  excludeEndpoints?: string[];
  /** Entities to add, or field-level overrides for detected ones (matched by name). */
  entities?: ManifestEntity[];
  /** Extra endpoints to add verbatim. */
  endpoints?: ManifestEndpoint[];
  auth?: { required?: boolean; roles?: string[] };
  datastore?: { dialect?: "sqlite" | "mysql" };
}

export interface ManifestEntity {
  name: string;
  fields?: Array<Partial<EntityField> & { name: string; type: EntityField["type"] }>;
  /** Replace detected fields entirely rather than merge. */
  replaceFields?: boolean;
}

export interface ManifestEndpoint {
  method: Endpoint["method"];
  path: string;
  operation?: Endpoint["operation"];
  entity?: string;
  auth?: boolean;
}

/** Load a manifest override from the frontend root, or null if none exists. */
export function loadManifest(frontendRoot: string): ManifestOverride | null {
  const jsonPath = join(frontendRoot, "backbone.manifest.json");
  if (existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, "utf8")) as ManifestOverride;
  }
  const tsPath = join(frontendRoot, "backbone.manifest.ts");
  if (existsSync(tsPath)) {
    return evalTsManifest(readFileSync(tsPath, "utf8"));
  }
  return null;
}

/** Transpile a tiny TS manifest to JS and read its default export. Deterministic, no AI. */
function evalTsManifest(source: string): ManifestOverride {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module: { exports: Record<string, unknown> } = { exports: {} };
  // eslint-disable-next-line no-new-func
  const run = new Function("module", "exports", js);
  run(module, module.exports);
  const exp = module.exports as Record<string, unknown>;
  return (exp.default ?? exp.manifest ?? exp) as ManifestOverride;
}

/** Apply an override to a detected Blueprint, returning a new Blueprint. */
export function applyManifest(bp: Blueprint, override: ManifestOverride | null): Blueprint {
  if (!override) return bp;
  let entities = [...bp.entities];
  let endpoints = [...bp.endpoints];

  if (override.excludeEntities?.length) {
    const drop = new Set(override.excludeEntities);
    entities = entities.filter((e) => !drop.has(e.name));
    endpoints = endpoints.filter((ep) => !ep.entity || !drop.has(ep.entity));
  }
  if (override.excludeEndpoints?.length) {
    const drop = new Set(override.excludeEndpoints);
    endpoints = endpoints.filter((ep) => !drop.has(`${ep.method} ${ep.path}`));
  }

  for (const me of override.entities ?? []) {
    const idx = entities.findIndex((e) => e.name === me.name);
    if (idx >= 0) {
      entities[idx] = mergeEntity(entities[idx], me);
    } else {
      entities.push(buildEntity(me));
    }
  }

  for (const mep of override.endpoints ?? []) {
    const key = `${mep.method} ${mep.path}`;
    if (endpoints.some((e) => `${e.method} ${e.path}` === key)) continue;
    endpoints.push({
      method: mep.method,
      path: mep.path,
      operation: mep.operation ?? "custom",
      entity: mep.entity,
      auth: { required: mep.auth ?? false },
      generate: true,
      sourceRefs: [{ file: "backbone.manifest", line: 1, note: "manifest endpoint" }],
    });
  }

  const auth = {
    required: override.auth?.required ?? bp.auth.required,
    roles: override.auth?.roles ?? bp.auth.roles,
  };
  const datastore = {
    ...bp.datastore,
    dialect: override.datastore?.dialect ?? bp.datastore.dialect,
    required: bp.datastore.required || entities.length > 0,
  };

  return { ...bp, entities, endpoints, auth, datastore, notes: [...bp.notes, "Manifest override applied."] };
}

function mergeEntity(base: Entity, override: ManifestEntity): Entity {
  const overrideFields = (override.fields ?? []).map(fillField);
  let fields: EntityField[];
  if (override.replaceFields) {
    fields = overrideFields;
  } else {
    const byName = new Map(base.fields.map((f) => [f.name, f]));
    for (const f of overrideFields) byName.set(f.name, { ...byName.get(f.name), ...f });
    fields = [...byName.values()];
  }
  return { ...base, fields };
}

function buildEntity(me: ManifestEntity): Entity {
  const fields = (me.fields ?? []).map(fillField);
  if (!fields.some((f) => f.primaryKey)) {
    fields.unshift({ name: "id", type: "int", nullable: false, primaryKey: true, sourceRefs: [] });
  }
  return {
    name: me.name,
    table: tableName(me.name),
    fields,
    relations: [],
    generate: true,
    sourceRefs: [{ file: "backbone.manifest", line: 1, note: "manifest entity" }],
  };
}

function fillField(f: Partial<EntityField> & { name: string; type: EntityField["type"] }): EntityField {
  return {
    name: f.name,
    type: f.type,
    nullable: f.nullable ?? false,
    enumValues: f.enumValues,
    fkTo: f.fkTo,
    primaryKey: f.primaryKey,
    sourceRefs: f.sourceRefs ?? [{ file: "backbone.manifest", line: 1 }],
  };
}
