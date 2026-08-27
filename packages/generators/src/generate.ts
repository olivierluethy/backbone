import { existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalizeBlueprint,
  diffBlueprints,
  type Architecture,
  type Blueprint,
  type BlueprintDiff,
  type Framework,
  type GenerateOptions,
  type Runtime,
} from "@backbone/core";
import { buildBlueprintView } from "./helpers.js";
import { resolveLayout } from "./layout.js";
import { writeFiles, type WriteReport } from "./render.js";
import { readLock, writeLock } from "./lock.js";
import { planMigration } from "./migrations.js";
import { buildArchitectureDoc, buildReport } from "./report.js";
import type { GenContext, Preset } from "./types.js";
import { getPreset, listPresets } from "./presets/index.js";

export interface GenerateResult {
  outDir: string;
  presetId: string;
  write: WriteReport;
  migrationFilename: string | null;
  diff: BlueprintDiff | null;
  report: string;
  fileCount: number;
}

/**
 * Generate (or regenerate) a backend from a Blueprint into `options.outDir`. Deterministic:
 * the same Blueprint + options produce the same files. Regeneration is additive — it
 * overwrites only the owned boundary, writes a new migration for schema changes, and never
 * edits old migrations or user code.
 *
 * `timestamp` is injected so callers control it (kept out of the pure planning path).
 */
export function generateBackend(
  blueprintInput: Blueprint,
  options: GenerateOptions,
  timestamp: string = new Date().toISOString(),
): GenerateResult {
  const blueprint = canonicalizeBlueprint(blueprintInput);
  const dialect = options.dialect ?? blueprint.datastore.dialect;
  const preset = getPreset(options.runtime, options.framework, options.architecture);
  const view = buildBlueprintView(blueprint, dialect);
  const layout = resolveLayout(options.architecture);
  const ctx: GenContext = { blueprint, view, options: { ...options, dialect }, layout };

  mkdirSync(options.outDir, { recursive: true });

  const prevLock = readLock(options.outDir);
  const diff = prevLock ? diffBlueprints(prevLock, blueprint) : null;

  // Project files (excludes migrations).
  const files = preset.build(ctx);
  const write = writeFiles(options.outDir, files);

  // Additive migration.
  const plan = planMigration(blueprint, prevLock, dialect);
  let migrationFilename: string | null = null;
  if (plan.hasWork) {
    const count = countMigrations(options.outDir);
    const sequence = count + 1;
    const revision = String(sequence).padStart(4, "0");
    const previousRevision = count > 0 ? String(count).padStart(4, "0") : null;
    const mf = preset.migration(ctx, plan, { sequence, previousRevision, revision });
    if (mf) {
      const ext =
        preset.migrationExtension ??
        (preset.runtime === "php" ? "php" : preset.runtime === "python" ? "py" : "ts");
      migrationFilename = `${revision}_${plan.slug}.${ext}`;
      const migDir = join(options.outDir, "migrations");
      mkdirSync(migDir, { recursive: true });
      writeFileSync(join(migDir, migrationFilename), mf.contents);
    }
  }

  writeLock(options.outDir, blueprint);

  const report = buildReport({
    blueprint,
    view,
    presetId: preset.id,
    runtime: options.runtime,
    framework: options.framework,
    architecture: options.architecture,
    layout,
    files,
    migrationFilename,
    plan,
    diff,
    timestamp,
  });
  writeFileSync(join(options.outDir, "GENERATION_REPORT.md"), report);

  // A per-project architecture reference, so the chosen pattern's layering is documented in-repo.
  const archDoc = buildArchitectureDoc({
    framework: options.framework,
    architecture: options.architecture,
    layout,
  });
  mkdirSync(join(options.outDir, "docs"), { recursive: true });
  writeFileSync(join(options.outDir, "docs", "ARCHITECTURE.md"), archDoc);

  return {
    outDir: options.outDir,
    presetId: preset.id,
    write,
    migrationFilename,
    diff,
    report,
    fileCount: files.length + (migrationFilename ? 1 : 0),
  };
}

/** Count existing migration files so sequence numbers stay stable and additive. */
function countMigrations(outDir: string): number {
  const dir = join(outDir, "migrations");
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => /^\d{4}_.*\.(ts|php|js)$/.test(f)).length;
}

export { getPreset, listPresets };
export type { Preset, Runtime, Framework, Architecture };
