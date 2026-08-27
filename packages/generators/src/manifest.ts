import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import type { Architecture, Framework, Runtime } from "@backbone/core";

/**
 * Sidecar manifest describing the last generation into an output directory. Unlike
 * `blueprint.lock.json` (a pure Blueprint, used for diffing) this records *how* the project was
 * generated — the runtime/framework/architecture and the exact set of **owned** files written — so
 * the next regenerate can detect a runtime switch and reconcile the owned boundary: any owned file
 * no longer emitted is deleted rather than left as an orphan.
 *
 * Only "owned" files are tracked. Write-once user files, accumulated migrations, and the tool docs
 * are never listed here and therefore never removed by reconciliation.
 */
const MANIFEST_FILE = "blueprint.manifest.json";

export interface GenerationManifest {
  version: 1;
  runtime: Runtime;
  framework: Framework;
  architecture: Architecture;
  /** Output-relative POSIX paths of every owned file written in the last run. */
  ownedFiles: string[];
  generatedAt: string;
}

export function readManifest(outDir: string): GenerationManifest | null {
  const p = join(outDir, MANIFEST_FILE);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as GenerationManifest;
    if (parsed.version !== 1 || !Array.isArray(parsed.ownedFiles)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeManifest(outDir: string, manifest: GenerationManifest): void {
  writeFileSync(join(outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n");
}

export interface ReconcileResult {
  /** Owned files removed because they are no longer part of the current output. */
  removed: string[];
  /** The runtime/framework recorded by the previous run, if it differed from the current one. */
  switchedFrom: { runtime: Runtime; framework: Framework } | null;
}

/**
 * Delete owned files that the previous run wrote but the current run did not — the orphans left by a
 * runtime switch or a deselected entity. Precise by construction: the deletion set is
 * `previousOwned − currentOwned`, so write-once files, migrations and docs (never in `previousOwned`)
 * are untouched. Empty directories left behind inside the owned boundary are pruned.
 */
export function reconcileOwned(
  outDir: string,
  prev: GenerationManifest | null,
  currentOwned: string[],
  current: { runtime: Runtime; framework: Framework },
): ReconcileResult {
  if (!prev) return { removed: [], switchedFrom: null };

  const keep = new Set(currentOwned);
  const removed: string[] = [];
  for (const rel of prev.ownedFiles) {
    if (keep.has(rel)) continue;
    const abs = join(outDir, ...rel.split("/"));
    if (!existsSync(abs)) continue;
    try {
      rmSync(abs, { force: true });
      removed.push(rel);
      pruneEmptyDirs(outDir, dirname(abs));
    } catch {
      /* best-effort — a locked/unreadable file is left in place */
    }
  }

  const switchedFrom =
    prev.runtime !== current.runtime || prev.framework !== current.framework
      ? { runtime: prev.runtime, framework: prev.framework }
      : null;

  return { removed: removed.sort(), switchedFrom };
}

/** Remove now-empty directories from `startDir` upward, never climbing past `stopDir`. */
function pruneEmptyDirs(stopDir: string, startDir: string): void {
  let dir = startDir;
  const stop = stopDir.replace(new RegExp(`\\${sep}+$`), "");
  while (dir.length > stop.length && dir.startsWith(stop)) {
    try {
      if (readdirSync(dir).length > 0) break;
      rmdirSync(dir);
    } catch {
      break;
    }
    dir = dirname(dir);
  }
}

export { MANIFEST_FILE };
