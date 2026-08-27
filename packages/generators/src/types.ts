import type { Blueprint, GenerateOptions } from "@backbone/core";
import type { BlueprintView, ColumnView, EntityView } from "./helpers.js";

/** Where a generated file sits relative to the ownership boundary. */
export type Ownership =
  /** Inside the generated/ boundary — overwritten on every regenerate. */
  | "owned"
  /** Outside the boundary — written once, never overwritten (user code). */
  | "once";

export interface GenFile {
  /** Output-relative POSIX path, e.g. "src/generated/models/project.ts". */
  path: string;
  contents: string;
  ownership: Ownership;
  /** Executable bit hint (e.g. for shell entrypoints). */
  executable?: boolean;
}

export interface MigrationFile {
  /** Filename only, e.g. "20240101000000_init.ts". Timestamp supplied by caller. */
  filename: string;
  contents: string;
}

export interface JoinTableView {
  name: string;
  left: string;
  right: string;
  leftFk: string;
  rightFk: string;
}

/** A structured, runtime-agnostic description of what a migration must apply. Additive only. */
export interface MigrationPlan {
  mode: "init" | "additive";
  /** Short slug for the filename, e.g. "init" or "add_task_and_columns". */
  slug: string;
  /** Full tables to create. */
  newTables: EntityView[];
  /** New many-to-many join tables to create. */
  newJoinTables: JoinTableView[];
  /** Columns to add to existing tables. */
  addedColumns: Array<{ table: string; column: ColumnView }>;
  /** Human notes for changes we do NOT apply (removals) — additive migrations never drop. */
  removedNotes: string[];
  hasWork: boolean;
}

export interface GenContext {
  blueprint: Blueprint;
  view: BlueprintView;
  options: GenerateOptions;
}

/** Sequencing context for a migration, so chained schemes (e.g. Alembic) can link revisions. */
export interface MigrationContext {
  /** 1-based sequence number of the migration about to be written. */
  sequence: number;
  /** Zero-padded revision id of the previous migration, or null for the first. */
  previousRevision: string | null;
  /** Zero-padded revision id for this migration (matches the filename prefix). */
  revision: string;
}

/** A pluggable template set for one runtime + architecture. */
export interface Preset {
  id: string;
  runtime: "node" | "php" | "python";
  architecture: "layered" | "modular" | "fastapi" | "django";
  /** Directory name of this preset's EJS templates under `templates/`. */
  templateDir: string;
  /** Migration file extension without the dot (default derived from runtime). */
  migrationExtension?: string;
  /** Build every project file (excluding migrations). */
  build(ctx: GenContext): GenFile[];
  /** Render an additive migration file from a structured plan, or null if no work. */
  migration(ctx: GenContext, plan: MigrationPlan, migCtx?: MigrationContext): MigrationFile | null;
}
