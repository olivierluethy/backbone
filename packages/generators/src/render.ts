import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import ejs from "ejs";
import * as helpers from "./helpers.js";
import type { GenFile } from "./types.js";

/** Templates live at package-root `templates/`, resolved relative to this file in dist. */
const TEMPLATES_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

const cache = new Map<string, ejs.TemplateFunction>();

/**
 * Render an EJS template from `templates/<templateDir>/<rel>`. The helper module is spread
 * into the template scope so templates can call `toSnakeCase`, `zodExpr`, etc. directly.
 * Deterministic: same context always yields the same string.
 */
export function render(templateDir: string, rel: string, data: Record<string, unknown>): string {
  const key = `${templateDir}/${rel}`;
  let fn = cache.get(key);
  if (!fn) {
    const file = join(TEMPLATES_ROOT, templateDir, rel);
    const src = readFileSync(file, "utf8");
    fn = ejs.compile(src, { filename: file, rmWhitespace: false });
    cache.set(key, fn);
  }
  return fn({ ...helpers, ...data, h: helpers });
}

/** Convenience: render a template into a GenFile. */
export function file(
  path: string,
  templateDir: string,
  rel: string,
  data: Record<string, unknown>,
  ownership: GenFile["ownership"],
  executable = false,
): GenFile {
  return { path, contents: render(templateDir, rel, data), ownership, executable };
}

/** A GenFile from a literal string (no template). */
export function literal(path: string, contents: string, ownership: GenFile["ownership"]): GenFile {
  return { path, contents, ownership };
}

export interface WriteReport {
  written: string[];
  skipped: string[]; // "once" files that already existed
}

/**
 * Write a set of GenFiles under `outDir`, honouring ownership: "owned" files are always
 * (over)written; "once" files are only written if absent, preserving user edits.
 */
export function writeFiles(outDir: string, files: GenFile[]): WriteReport {
  const written: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const abs = join(outDir, f.path);
    if (f.ownership === "once" && existsSync(abs)) {
      skipped.push(f.path);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.contents);
    if (f.executable) {
      try {
        chmodSync(abs, 0o755);
      } catch {
        /* best-effort */
      }
    }
    written.push(f.path);
  }
  return { written, skipped };
}
