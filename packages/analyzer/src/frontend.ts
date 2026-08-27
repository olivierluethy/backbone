import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { FrontendFramework, FrontendInfo, SourceRef } from "@backbone/core";

/**
 * Deterministic frontend-framework detection. Two signals, in priority order:
 *
 *   1. `package.json` dependencies + devDependencies — the authoritative signal. Framework
 *      packages are matched most-specific first (Next.js before React, Nuxt/SvelteKit before
 *      their base library) so a meta-framework is never mis-reported as its underlying library.
 *   2. Source-file extensions — a fallback when there is no package.json or no known dependency
 *      (`.vue` → Vue, `.svelte` → Svelte, `.tsx`/`.jsx` → React via JSX).
 *
 * When neither signal is conclusive the result is "unknown"/`detected: false` — never guessed.
 * No network, no install resolution: purely reading files already on disk.
 */

interface Signature {
  framework: FrontendFramework;
  displayName: string;
  /** Dependency names that identify this framework, in the package.json. */
  deps: string[];
}

/** Ordered most-specific → least-specific so meta-frameworks win over their base library. */
const SIGNATURES: Signature[] = [
  { framework: "next", displayName: "Next.js", deps: ["next"] },
  { framework: "nuxt", displayName: "Nuxt", deps: ["nuxt", "nuxt3"] },
  { framework: "sveltekit", displayName: "SvelteKit", deps: ["@sveltejs/kit"] },
  { framework: "angular", displayName: "Angular", deps: ["@angular/core"] },
  { framework: "vue", displayName: "Vue", deps: ["vue", "@vue/runtime-core"] },
  { framework: "svelte", displayName: "Svelte", deps: ["svelte"] },
  { framework: "solid", displayName: "SolidJS", deps: ["solid-js"] },
  { framework: "preact", displayName: "Preact", deps: ["preact"] },
  { framework: "react", displayName: "React", deps: ["react"] },
];

/** Known build tools, matched from dependencies, surfaced as the FrontendInfo `meta`. */
const BUILD_TOOLS: Array<{ dep: string; label: string }> = [
  { dep: "vite", label: "Vite" },
  { dep: "@vitejs/plugin-react", label: "Vite" },
  { dep: "webpack", label: "Webpack" },
  { dep: "parcel", label: "Parcel" },
  { dep: "@remix-run/react", label: "Remix" },
  { dep: "gatsby", label: "Gatsby" },
];

const UNDETECTED: FrontendInfo = {
  framework: "unknown",
  displayName: "Undetected",
  detected: false,
  sourceRefs: [],
};

/** Detect the frontend framework for a project rooted at `root`. Deterministic. */
export function detectFrontend(root: string): FrontendInfo {
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    const fromPkg = detectFromPackageJson(root, pkgPath);
    if (fromPkg) return fromPkg;
  }
  return detectFromSources(root) ?? UNDETECTED;
}

function detectFromPackageJson(root: string, pkgPath: string): FrontendInfo | null {
  let raw: string;
  try {
    raw = readFileSync(pkgPath, "utf8");
  } catch {
    return null;
  }
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(raw);
  } catch {
    return null;
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  for (const sig of SIGNATURES) {
    const hit = sig.deps.find((d) => d in deps);
    if (!hit) continue;
    const version = cleanVersion(deps[hit]);
    return {
      framework: sig.framework,
      displayName: sig.displayName,
      version,
      meta: buildMeta(deps),
      detected: true,
      sourceRefs: [packageJsonRef(root, raw, hit)],
    };
  }
  return null;
}

/** Secondary build-tool / language hint for the FrontendInfo `meta`. */
function buildMeta(deps: Record<string, string>): string | undefined {
  const parts: string[] = [];
  for (const t of BUILD_TOOLS) {
    if (t.dep in deps && !parts.includes(t.label)) parts.push(t.label);
  }
  if ("typescript" in deps) parts.push("TypeScript");
  return parts.length ? parts.join(" · ") : undefined;
}

/** Normalise a semver range ("^18.2.0", "~5.0", "18") to a plain version string. */
function cleanVersion(range: string | undefined): string | undefined {
  if (!range) return undefined;
  const m = range.match(/(\d+(?:\.\d+){0,2})/);
  return m ? m[1] : undefined;
}

/** A SourceRef pointing at the package.json line where the framework dependency is declared. */
function packageJsonRef(root: string, raw: string, dep: string): SourceRef {
  const lines = raw.split("\n");
  const needle = `"${dep}"`;
  const idx = lines.findIndex((l) => l.includes(needle + ":") || l.trimStart().startsWith(needle));
  return {
    file: "package.json",
    line: idx >= 0 ? idx + 1 : 1,
    note: `dependency ${dep}`,
  };
}

/**
 * Fallback: infer from source-file extensions when package.json is missing/uninformative.
 * Bounded, deterministic depth-first scan (skips node_modules/.git/build output).
 */
function detectFromSources(root: string): FrontendInfo | null {
  const found = scanExtensions(root, root, 0);
  if (found.vue) return extResult("vue", "Vue", found.vue);
  if (found.svelte) return extResult("svelte", "Svelte", found.svelte);
  if (found.jsx) return extResult("react", "React", found.jsx);
  return null;
}

function extResult(framework: FrontendFramework, displayName: string, ref: SourceRef): FrontendInfo {
  return {
    framework,
    displayName,
    meta: "detected from source files",
    detected: true,
    sourceRefs: [ref],
  };
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", "out", "coverage"]);
const MAX_DEPTH = 6;

/** Return the first matching source file per extension family (deterministic, sorted). */
function scanExtensions(
  root: string,
  dir: string,
  depth: number,
  acc: { vue?: SourceRef; svelte?: SourceRef; jsx?: SourceRef } = {},
): { vue?: SourceRef; svelte?: SourceRef; jsx?: SourceRef } {
  if (depth > MAX_DEPTH) return acc;
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return acc;
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
      scanExtensions(root, full, depth + 1, acc);
    } else {
      if (!acc.vue && name.endsWith(".vue")) acc.vue = fileRef(root, full);
      else if (!acc.svelte && name.endsWith(".svelte")) acc.svelte = fileRef(root, full);
      else if (!acc.jsx && (name.endsWith(".tsx") || name.endsWith(".jsx"))) acc.jsx = fileRef(root, full);
    }
    if (acc.vue && acc.svelte && acc.jsx) break;
  }
  return acc;
}

function fileRef(root: string, full: string): SourceRef {
  return { file: relative(root, full).split("\\").join("/"), line: 1, note: "source file" };
}
