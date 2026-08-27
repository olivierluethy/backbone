import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeBlueprint, serializeBlueprint, type Blueprint } from "@backbone/core";

const LOCK_FILE = "blueprint.lock.json";

/** Read the previously generated Blueprint from `<outDir>/blueprint.lock.json`, if any. */
export function readLock(outDir: string): Blueprint | null {
  const p = join(outDir, LOCK_FILE);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Blueprint;
  } catch {
    return null;
  }
}

/** Persist the Blueprint that was just generated, canonicalised for stable diffs. */
export function writeLock(outDir: string, bp: Blueprint): void {
  writeFileSync(join(outDir, LOCK_FILE), serializeBlueprint(canonicalizeBlueprint(bp)));
}
