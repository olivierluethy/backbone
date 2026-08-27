import { Project, type SourceFile, Node } from "ts-morph";
import { existsSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import type { SourceRef } from "@backbone/core";

/**
 * Load the frontend as a ts-morph Project. We do not type-check or resolve node_modules —
 * analysis is purely syntactic, which keeps it fast and deterministic.
 */
export function loadFrontend(frontendPath: string): { project: Project; root: string } {
  const root = isAbsolute(frontendPath) ? frontendPath : join(process.cwd(), frontendPath);
  const srcDir = existsSync(join(root, "src")) ? join(root, "src") : root;

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false, jsx: 4 /* ReactJSX */ },
    useInMemoryFileSystem: false,
  });
  project.addSourceFilesAtPaths([
    join(srcDir, "**/*.ts"),
    join(srcDir, "**/*.tsx"),
    `!${join(srcDir, "**/*.d.ts")}`,
    `!${join(srcDir, "**/node_modules/**")}`,
  ]);
  return { project, root };
}

/** Build a frontend-relative SourceRef for any node. */
export function sourceRef(node: Node, root: string, note?: string): SourceRef {
  const sf = node.getSourceFile();
  const file = toPosix(relative(root, sf.getFilePath()));
  const line = sf.getLineAndColumnAtPos(node.getStart()).line;
  return note ? { file, line, note } : { file, line };
}

export function relPath(sf: SourceFile, root: string): string {
  return toPosix(relative(root, sf.getFilePath()));
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

/** Does this file live under a models/ types/ entities/ directory (any depth)? */
export function isEntityDir(sf: SourceFile, root: string): boolean {
  const rel = relPath(sf, root).toLowerCase();
  return /(^|\/)(models|entities|types)(\/|$)/.test(rel) || /\.model\.tsx?$/.test(rel);
}

/** Read the leading JSDoc/comment text attached to a node, if any. */
export function leadingComments(node: Node): string {
  return node
    .getLeadingCommentRanges()
    .map((r) => r.getText())
    .join("\n");
}
