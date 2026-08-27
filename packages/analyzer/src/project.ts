import { Project, type SourceFile, Node } from "ts-morph";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import type { SourceRef } from "@backbone/core";

/**
 * Load the frontend as a ts-morph Project. We do not type-check or resolve node_modules —
 * analysis is purely syntactic, which keeps it fast and deterministic.
 *
 * Both TypeScript AND JavaScript frontends are supported: `.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`
 * are scanned (so a plain React-JS or a Vue/Angular app is analysable, not just React-TS). For
 * component single-file formats that ts-morph cannot parse directly (`.vue`, `.svelte`), the
 * `<script>` block is extracted into a line-preserving virtual TS file so its API calls, imports
 * and (typed) models are still seen with correct source line numbers.
 */
export function loadFrontend(frontendPath: string): { project: Project; root: string } {
  const root = isAbsolute(frontendPath) ? frontendPath : join(process.cwd(), frontendPath);
  const srcDir = existsSync(join(root, "src")) ? join(root, "src") : root;

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    // allowJs so plain-JS frontends are parsed; jsx for React/Solid JSX/TSX.
    compilerOptions: { allowJs: true, jsx: 4 /* ReactJSX */ },
    useInMemoryFileSystem: false,
  });
  project.addSourceFilesAtPaths([
    join(srcDir, "**/*.ts"),
    join(srcDir, "**/*.tsx"),
    join(srcDir, "**/*.js"),
    join(srcDir, "**/*.jsx"),
    join(srcDir, "**/*.mjs"),
    join(srcDir, "**/*.cjs"),
    `!${join(srcDir, "**/*.d.ts")}`,
    `!${join(srcDir, "**/*.config.js")}`,
    `!${join(srcDir, "**/*.config.ts")}`,
    `!${join(srcDir, "**/*.config.mjs")}`,
    `!${join(srcDir, "**/node_modules/**")}`,
    `!${join(srcDir, "**/dist/**")}`,
    `!${join(srcDir, "**/build/**")}`,
  ]);

  // Extract <script> blocks from Vue/Svelte single-file components into virtual TS files.
  addComponentScripts(project, srcDir);

  return { project, root };
}

/** Virtual-file suffix marking a source extracted from a .vue/.svelte `<script>` block. */
const SCRIPT_SUFFIX = ".bbscript.ts";

/** Directories we never descend into when scanning for component files. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", "out", "coverage"]);

/**
 * Find every `.vue`/`.svelte` file under `dir` and register its `<script>` content as a virtual
 * TypeScript source file, preserving original line positions so source refs stay accurate.
 */
function addComponentScripts(project: Project, dir: string, depth = 0): void {
  if (depth > 12) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".") continue;
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      addComponentScripts(project, full, depth + 1);
    } else if (name.endsWith(".vue") || name.endsWith(".svelte")) {
      let source: string;
      try {
        source = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const script = extractScriptBlocks(source);
      if (script) project.createSourceFile(full + SCRIPT_SUFFIX, script, { overwrite: true });
    }
  }
}

/**
 * Blank everything outside `<script>…</script>` blocks (keeping newlines) so the returned string
 * has identical line/column offsets to the original file, with only the script code present.
 * Returns null when the file has no script block.
 */
function extractScriptBlocks(source: string): string | null {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const chars: string[] = new Array(source.length);
  for (let i = 0; i < source.length; i++) chars[i] = source[i] === "\n" ? "\n" : " ";
  let any = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    any = true;
    const inner = m[1];
    const start = m.index + m[0].indexOf(inner);
    for (let i = 0; i < inner.length; i++) chars[start + i] = inner[i];
  }
  return any ? chars.join("") : null;
}

/** Build a frontend-relative SourceRef for any node. */
export function sourceRef(node: Node, root: string, note?: string): SourceRef {
  const sf = node.getSourceFile();
  const file = normalizeRel(relative(root, sf.getFilePath()));
  const line = sf.getLineAndColumnAtPos(node.getStart()).line;
  return note ? { file, line, note } : { file, line };
}

export function relPath(sf: SourceFile, root: string): string {
  return normalizeRel(relative(root, sf.getFilePath()));
}

/** POSIX separators, and strip the virtual `<script>`-extraction suffix back to the real file. */
function normalizeRel(p: string): string {
  return toPosix(p).replace(new RegExp(SCRIPT_SUFFIX.replace(/\./g, "\\.") + "$"), "");
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

/** Does this file live under a models/ types/ entities/ directory (any depth)? */
export function isEntityDir(sf: SourceFile, root: string): boolean {
  const rel = relPath(sf, root).toLowerCase();
  return /(^|\/)(models|entities|types)(\/|$)/.test(rel) || /\.model\.[tj]sx?$/.test(rel);
}

/** Read the leading JSDoc/comment text attached to a node, if any. */
export function leadingComments(node: Node): string {
  return node
    .getLeadingCommentRanges()
    .map((r) => r.getText())
    .join("\n");
}
