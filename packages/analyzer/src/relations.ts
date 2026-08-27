import {
  joinTableName,
  tableName,
  toPascalCase,
  toSnakeCase,
  type Entity,
  type EntityField,
  type Relation,
  type SourceRef,
} from "@backbone/core";
import type { EntityDraft, RawProp } from "./entities.js";
import { primaryKeyField } from "./entities.js";

/**
 * Turn entity drafts (name + raw mapped props) into full entities with fields and
 * relations, applying the relation-inference rules deterministically.
 */
export function buildEntities(drafts: EntityDraft[], entityNames: Set<string>): Entity[] {
  const entities = drafts.map((d) => buildOne(d, entityNames));
  resolveManyToMany(entities);
  resolveForeignKeyTypes(entities);
  return entities;
}

function buildOne(draft: EntityDraft, entityNames: Set<string>): Entity {
  const fields: EntityField[] = [];
  const relations: Relation[] = [];
  const table = tableFor(draft.name);

  // Primary key first.
  const pk = primaryKeyField(draft.props) ?? synthPk();
  fields.push(pk);
  const pkNames = new Set(["id", "uuid", "_id"]);

  for (const prop of draft.props) {
    if (pkNames.has(prop.name) && prop === firstPk(draft.props)) continue;

    const { refName, isArray, type, nullable, enumValues } = prop.mapped;

    // (a) property typed as another entity.
    if (refName && entityNames.has(refName)) {
      if (isArray) {
        // OtherEntity[] -> one-to-many; FK lives on the target side.
        relations.push({
          kind: "one-to-many",
          target: refName,
          fk: `${toSnakeCase(draft.name)}_id`,
          via: prop.name,
          sourceRefs: prop.sourceRefs,
        });
      } else {
        // OtherEntity -> many-to-one; add a FK scalar column on this entity.
        const fkName = `${prop.name}Id`;
        addField(fields, {
          name: fkName,
          type: "int", // refined in resolveForeignKeyTypes
          nullable,
          fkTo: refName,
          sourceRefs: prop.sourceRefs,
        });
        relations.push({
          kind: "many-to-one",
          target: refName,
          fk: toSnakeCase(fkName),
          via: prop.name,
          sourceRefs: prop.sourceRefs,
        });
      }
      continue;
    }

    // (b) scalar foreign key by naming convention: <base>Id / <base>_id.
    const fkTarget = scalarFkTarget(prop.name, entityNames);
    if (fkTarget) {
      addField(fields, {
        name: prop.name,
        type: type === "uuid" ? "uuid" : "int",
        nullable,
        fkTo: fkTarget,
        sourceRefs: prop.sourceRefs,
      });
      relations.push({
        kind: "many-to-one",
        target: fkTarget,
        fk: toSnakeCase(prop.name),
        via: prop.name,
        sourceRefs: prop.sourceRefs,
      });
      continue;
    }

    // (c) plain scalar / enum / json field.
    addField(fields, {
      name: prop.name,
      type,
      nullable,
      enumValues,
      sourceRefs: prop.sourceRefs,
    });
  }

  return {
    name: draft.name,
    table,
    fields,
    relations: dedupeRelations(relations),
    generate: true,
    sourceRefs: draft.sourceRefs,
  };
}

/** Merge relations that describe the same edge (same kind, target and FK column). */
function dedupeRelations(relations: Relation[]): Relation[] {
  const seen = new Map<string, Relation>();
  for (const r of relations) {
    const key = `${r.kind}|${r.target}|${r.fk ?? ""}|${r.joinTable ?? ""}`;
    const existing = seen.get(key);
    if (existing) {
      existing.sourceRefs.push(...r.sourceRefs);
      existing.via = existing.via ?? r.via;
    } else {
      seen.set(key, { ...r });
    }
  }
  return [...seen.values()];
}

function firstPk(props: RawProp[]): RawProp | undefined {
  return props.find((p) => p.name === "id" || p.name === "uuid" || p.name === "_id");
}

function synthPk(): EntityField {
  return { name: "id", type: "int", nullable: false, primaryKey: true, sourceRefs: [] };
}

function addField(fields: EntityField[], field: EntityField): void {
  const idx = fields.findIndex((f) => f.name === field.name);
  if (idx >= 0) fields[idx] = { ...fields[idx], ...field };
  else fields.push(field);
}

/** `projectId` / `project_id` -> "Project" if that entity exists. */
function scalarFkTarget(fieldName: string, entityNames: Set<string>): string | undefined {
  const m = fieldName.match(/^(.*?)(?:_id|Id)$/);
  if (!m || !m[1]) return undefined;
  const candidate = toPascalCase(m[1]);
  return entityNames.has(candidate) ? candidate : undefined;
}

/** If A has `B[]` and B has `A[]`, collapse both one-to-manys into a many-to-many. */
function resolveManyToMany(entities: Entity[]): void {
  const byName = new Map(entities.map((e) => [e.name, e]));
  const handled = new Set<string>();

  for (const a of entities) {
    for (const relA of [...a.relations]) {
      if (relA.kind !== "one-to-many") continue;
      const b = byName.get(relA.target);
      if (!b) continue;
      const relB = b.relations.find((r) => r.kind === "one-to-many" && r.target === a.name);
      if (!relB) continue;

      const pairKey = [a.name, b.name].sort().join("|");
      if (handled.has(pairKey)) continue;
      handled.add(pairKey);

      const join = joinTableName(a.table, b.table);
      const refs: SourceRef[] = [...relA.sourceRefs, ...relB.sourceRefs];
      a.relations = a.relations.filter((r) => r !== relA);
      b.relations = b.relations.filter((r) => r !== relB);
      a.relations.push({ kind: "many-to-many", target: b.name, joinTable: join, via: relA.via, sourceRefs: refs });
      b.relations.push({ kind: "many-to-many", target: a.name, joinTable: join, via: relB.via, sourceRefs: refs });
    }
  }
}

/** FK columns take the type of their target's primary key (int or uuid). */
function resolveForeignKeyTypes(entities: Entity[]): void {
  const pkType = new Map<string, "int" | "uuid">();
  for (const e of entities) {
    const pk = e.fields.find((f) => f.primaryKey);
    pkType.set(e.name, pk?.type === "uuid" ? "uuid" : "int");
  }
  for (const e of entities) {
    for (const f of e.fields) {
      if (f.fkTo) f.type = pkType.get(f.fkTo) ?? "int";
    }
  }
}

function tableFor(name: string): string {
  return tableName(name);
}
