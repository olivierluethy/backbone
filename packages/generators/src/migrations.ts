import { diffBlueprints, type Blueprint } from "@backbone/core";
import { buildBlueprintView, type ColumnView, type EntityView } from "./helpers.js";
import type { MigrationPlan } from "./types.js";

/**
 * Plan an additive migration. With no previous lock this is the full "init" schema; with a
 * lock, it is the change set from `prev` to `next` — new tables, new join tables, and new
 * columns. Removals are recorded as notes only: additive migrations never drop.
 */
export function planMigration(
  next: Blueprint,
  prev: Blueprint | null,
  dialect: Blueprint["datastore"]["dialect"],
): MigrationPlan {
  const nextView = buildBlueprintView(next, dialect);

  if (!prev) {
    return {
      mode: "init",
      slug: "init",
      newTables: nextView.entities,
      newJoinTables: nextView.joinTables,
      addedColumns: [],
      removedNotes: [],
      hasWork: nextView.entities.length > 0 || nextView.joinTables.length > 0,
    };
  }

  const prevView = buildBlueprintView(prev, dialect);
  const diff = diffBlueprints(prev, next);
  const prevTables = new Set(prevView.entities.map((e) => e.table));
  const prevJoins = new Set(prevView.joinTables.map((j) => j.name));
  const prevColsByTable = new Map<string, Set<string>>(
    prevView.entities.map((e) => [e.table, new Set(e.columns.map((c) => c.name))]),
  );

  const newTables: EntityView[] = nextView.entities.filter((e) => !prevTables.has(e.table));
  const newJoinTables = nextView.joinTables.filter((j) => !prevJoins.has(j.name));

  const addedColumns: Array<{ table: string; column: ColumnView }> = [];
  for (const e of nextView.entities) {
    if (!prevTables.has(e.table)) continue; // whole table is new -> handled above
    const known = prevColsByTable.get(e.table) ?? new Set<string>();
    for (const c of e.columns) {
      if (!known.has(c.name)) addedColumns.push({ table: e.table, column: c });
    }
  }

  const removedNotes: string[] = [];
  for (const ec of diff.entities) {
    if (ec.kind === "removed") removedNotes.push(`entity ${ec.entity} removed (table kept)`);
    for (const fc of ec.fieldChanges) {
      if (fc.kind === "removed") removedNotes.push(`${ec.entity}.${fc.field} removed (column kept)`);
      if (fc.kind === "changed") removedNotes.push(`${ec.entity}.${fc.field} type changed (not altered)`);
    }
  }

  const slug = migrationSlug(newTables, newJoinTables, addedColumns);
  return {
    mode: "additive",
    slug,
    newTables,
    newJoinTables,
    addedColumns,
    removedNotes,
    hasWork: newTables.length > 0 || newJoinTables.length > 0 || addedColumns.length > 0,
  };
}

function migrationSlug(
  tables: EntityView[],
  joins: { name: string }[],
  cols: { table: string }[],
): string {
  const parts: string[] = [];
  if (tables.length) parts.push(`add_${tables.map((t) => t.table).join("_")}`);
  if (joins.length) parts.push(`join_${joins.map((j) => j.name).join("_")}`);
  if (cols.length) {
    const tset = [...new Set(cols.map((c) => c.table))];
    parts.push(`cols_${tset.join("_")}`);
  }
  const slug = parts.join("__").slice(0, 60);
  return slug || "update";
}
