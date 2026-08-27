import type { Blueprint, Entity, Endpoint, EntityField } from "./types.js";

/**
 * Blueprint diffing drives regeneration. It compares the previous locked Blueprint against
 * a freshly analysed one and produces a change set. The generators turn "added/changed"
 * entities and fields into *additive* migrations — old migrations are never edited.
 */

export type ChangeKind = "added" | "removed" | "changed" | "unchanged";

export interface FieldChange {
  field: string;
  kind: ChangeKind;
  before?: EntityField;
  after?: EntityField;
}

export interface EntityChange {
  entity: string;
  kind: ChangeKind;
  fieldChanges: FieldChange[];
}

export interface EndpointChange {
  key: string; // `${method} ${path}`
  kind: ChangeKind;
  before?: Endpoint;
  after?: Endpoint;
}

export interface BlueprintDiff {
  entities: EntityChange[];
  endpoints: EndpointChange[];
  /** True if anything at all changed — cheap gate for "no-op regenerate". */
  hasChanges: boolean;
  /** Entities/fields that require a new additive migration. */
  migrationNeeded: boolean;
}

function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.name, i]));
}

function fieldSignature(f: EntityField): string {
  return JSON.stringify({
    type: f.type,
    nullable: f.nullable,
    enumValues: f.enumValues ? [...f.enumValues].sort() : undefined,
    fkTo: f.fkTo,
    primaryKey: !!f.primaryKey,
  });
}

function diffEntity(prev: Entity | undefined, next: Entity | undefined): EntityChange {
  const name = (next ?? prev)!.name;
  if (!prev) return { entity: name, kind: "added", fieldChanges: allFields(next!, "added") };
  if (!next) return { entity: name, kind: "removed", fieldChanges: allFields(prev, "removed") };

  const prevFields = byName(prev.fields);
  const nextFields = byName(next.fields);
  const seen = new Set<string>();
  const fieldChanges: FieldChange[] = [];

  for (const [fname, pf] of prevFields) {
    seen.add(fname);
    const nf = nextFields.get(fname);
    if (!nf) {
      fieldChanges.push({ field: fname, kind: "removed", before: pf });
    } else if (fieldSignature(pf) !== fieldSignature(nf)) {
      fieldChanges.push({ field: fname, kind: "changed", before: pf, after: nf });
    } else {
      fieldChanges.push({ field: fname, kind: "unchanged", before: pf, after: nf });
    }
  }
  for (const [fname, nf] of nextFields) {
    if (!seen.has(fname)) fieldChanges.push({ field: fname, kind: "added", after: nf });
  }

  const changed = fieldChanges.some((f) => f.kind !== "unchanged");
  return { entity: name, kind: changed ? "changed" : "unchanged", fieldChanges };
}

function allFields(e: Entity, kind: ChangeKind): FieldChange[] {
  return e.fields.map((f) => ({ field: f.name, kind, after: f, before: f }));
}

function endpointKey(ep: Endpoint): string {
  return `${ep.method} ${ep.path}`;
}

/** Compute the change set from `prev` to `next`. Pure and deterministic. */
export function diffBlueprints(prev: Blueprint, next: Blueprint): BlueprintDiff {
  const prevEntities = byName(prev.entities);
  const nextEntities = byName(next.entities);
  const entityNames = new Set([...prevEntities.keys(), ...nextEntities.keys()]);

  const entities: EntityChange[] = [];
  for (const name of [...entityNames].sort()) {
    entities.push(diffEntity(prevEntities.get(name), nextEntities.get(name)));
  }

  const prevEp = new Map(prev.endpoints.map((e) => [endpointKey(e), e]));
  const nextEp = new Map(next.endpoints.map((e) => [endpointKey(e), e]));
  const epKeys = new Set([...prevEp.keys(), ...nextEp.keys()]);
  const endpoints: EndpointChange[] = [];
  for (const key of [...epKeys].sort()) {
    const before = prevEp.get(key);
    const after = nextEp.get(key);
    let kind: ChangeKind = "unchanged";
    if (!before) kind = "added";
    else if (!after) kind = "removed";
    else if (JSON.stringify(before) !== JSON.stringify(after)) kind = "changed";
    endpoints.push({ key, kind, before, after });
  }

  const entitiesChanged = entities.some((e) => e.kind !== "unchanged");
  const endpointsChanged = endpoints.some((e) => e.kind !== "unchanged");
  // A migration is needed for new entities/tables or added/changed columns.
  const migrationNeeded = entities.some(
    (e) =>
      e.kind === "added" ||
      (e.kind === "changed" &&
        e.fieldChanges.some((f) => f.kind === "added" || f.kind === "changed")),
  );

  return {
    entities,
    endpoints,
    hasChanges: entitiesChanged || endpointsChanged,
    migrationNeeded,
  };
}

/** Flatten a diff into a short, human-readable summary (for CLI + report). */
export function summarizeDiff(diff: BlueprintDiff): string[] {
  const lines: string[] = [];
  for (const e of diff.entities) {
    if (e.kind === "unchanged") continue;
    if (e.kind === "added") lines.push(`+ entity ${e.entity}`);
    else if (e.kind === "removed") lines.push(`- entity ${e.entity}`);
    else {
      const fc = e.fieldChanges.filter((f) => f.kind !== "unchanged");
      lines.push(`~ entity ${e.entity} (${fc.map((f) => `${symbol(f.kind)}${f.field}`).join(", ")})`);
    }
  }
  for (const ep of diff.endpoints) {
    if (ep.kind === "unchanged") continue;
    lines.push(`${symbol(ep.kind)} endpoint ${ep.key}`);
  }
  return lines;
}

function symbol(kind: ChangeKind): string {
  return kind === "added" ? "+" : kind === "removed" ? "-" : kind === "changed" ? "~" : " ";
}
