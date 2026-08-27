import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, isAbsolute, sep, extname, basename } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import express from "express";
import cors from "cors";
import archiver from "archiver";
import { canonicalizeBlueprint, type Architecture, type Blueprint, type Runtime } from "@backbone/core";
import { analyzeFrontend } from "@backbone/analyzer";
import { generateBackend, listPresets } from "@backbone/generators";

/**
 * Thin pipeline server. It runs the deterministic analyzer/generators on disk — there is no
 * AI here and no state beyond the filesystem. The React client drives every step.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const HOME = homedir();
const PORT = Number(process.env.WEB_SERVER_PORT ?? 5411);

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

/** Resolve a user-supplied path against the repo root when relative. */
function resolvePath(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

/** True if `target` is inside `base` (prevents path traversal outside a served root). */
function isInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

app.get("/api/meta", (_req, res) => {
  res.json({
    repoRoot: REPO_ROOT,
    home: HOME,
    demoPath: "examples/demo-frontend",
    presets: listPresets(),
  });
});

app.get("/api/presets", (_req, res) => {
  res.json(listPresets());
});

/** Directory browser backing the folder picker. Lists subdirectories of `path`. */
app.get("/api/fs/list", (req, res) => {
  const requested = typeof req.query.path === "string" && req.query.path ? req.query.path : HOME;
  const current = resolve(requested);
  if (!existsSync(current) || !statSync(current).isDirectory()) {
    return res.status(400).json({ error: `Not a directory: ${current}` });
  }
  let dirs: Array<{ name: string; path: string; hasChildren: boolean }> = [];
  try {
    dirs = readdirSync(current, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
      .map((d) => {
        const full = join(current, d.name);
        let hasChildren = false;
        try {
          hasChildren = readdirSync(full, { withFileTypes: true }).some(
            (c) => c.isDirectory() && !c.name.startsWith("."),
          );
        } catch {
          /* unreadable — treat as leaf */
        }
        return { name: d.name, path: full, hasChildren };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    return res.status(400).json({ error: `Cannot read directory: ${(err as Error).message}` });
  }
  const parent = current === sep ? null : dirname(current);
  // A frontend is likely here if it has a package.json or a src/ dir.
  const looksLikeProject =
    existsSync(join(current, "package.json")) || existsSync(join(current, "src"));
  res.json({ current, parent, home: HOME, repoRoot: REPO_ROOT, looksLikeProject, dirs });
});

app.post("/api/analyze", (req, res) => {
  const { frontendPath } = req.body as { frontendPath?: string };
  if (!frontendPath) return res.status(400).json({ error: "frontendPath is required." });
  const abs = resolvePath(frontendPath);
  if (!existsSync(abs)) return res.status(400).json({ error: `No such path: ${abs}` });
  try {
    const blueprint = canonicalizeBlueprint(analyzeFrontend(abs));
    return res.json({ blueprint });
  } catch (err) {
    return res.status(400).json({ error: `Analysis failed: ${(err as Error).message}` });
  }
});

/** Where a given runtime/architecture would write, and whether it already exists. */
function targetFor(runtime: string, architecture: string, outDir?: string): string {
  return outDir ? resolvePath(outDir) : join(REPO_ROOT, "generated-backends", `${runtime}-${architecture}`);
}

app.get("/api/target-status", (req, res) => {
  const runtime = String(req.query.runtime ?? "node");
  const architecture = String(req.query.architecture ?? "layered");
  const outDir = typeof req.query.outDir === "string" ? req.query.outDir : undefined;
  const target = targetFor(runtime, architecture, outDir);
  const lockExists = existsSync(join(target, "blueprint.lock.json"));
  res.json({
    target,
    targetRel: relative(REPO_ROOT, target),
    exists: existsSync(target),
    lockExists,
    mode: lockExists ? "regenerate" : "generate",
  });
});

app.post("/api/generate", (req, res) => {
  const { blueprint, runtime, architecture, dialect, outDir } = req.body as {
    blueprint?: Blueprint;
    runtime?: Runtime;
    architecture?: Architecture;
    dialect?: "sqlite" | "mysql";
    outDir?: string;
  };
  if (!blueprint) return res.status(400).json({ error: "blueprint is required." });
  const rt = (runtime ?? "node") as Runtime;
  const arch = (architecture ?? "layered") as Architecture;
  const target = targetFor(rt, arch, outDir);
  const wasRegenerate = existsSync(join(target, "blueprint.lock.json"));
  try {
    const result = generateBackend(blueprint, {
      runtime: rt,
      architecture: arch,
      outDir: target,
      dialect: dialect ?? "sqlite",
    });
    return res.json({
      ...result,
      mode: wasRegenerate ? "regenerate" : "generate",
      outDirRel: relative(REPO_ROOT, result.outDir),
      fileTree: listTree(result.outDir).map((f) => relative(result.outDir, f).split(sep).join("/")),
    });
  } catch (err) {
    return res.status(400).json({ error: `Generation failed: ${(err as Error).message}` });
  }
});

app.post("/api/source", (req, res) => {
  const { root, file, line } = req.body as { root?: string; file?: string; line?: number };
  if (!root || !file) return res.status(400).json({ error: "root and file are required." });
  const base = resolvePath(root);
  const target = resolve(base, file);
  if (!isInside(base, target)) return res.status(400).json({ error: "Path outside root." });
  if (!existsSync(target)) return res.status(400).json({ error: `No such file: ${file}` });
  const all = readFileSync(target, "utf8").split("\n");
  const focus = line ?? 1;
  const from = Math.max(1, focus - 3);
  const to = Math.min(all.length, focus + 3);
  const lines: Array<{ n: number; text: string }> = [];
  for (let n = from; n <= to; n++) lines.push({ n, text: all[n - 1] ?? "" });
  res.json({ file, focus, lines });
});

/** Resolve and validate a generated-output dir — must live under the repo root. */
function generatedDir(dir: unknown): string | null {
  if (typeof dir !== "string" || !dir) return null;
  const abs = resolvePath(dir);
  if (!isInside(REPO_ROOT, abs) || !existsSync(abs)) return null;
  return abs;
}

/** Nested tree of a generated output directory. */
app.get("/api/generated/tree", (req, res) => {
  const dir = generatedDir(req.query.dir);
  if (!dir) return res.status(400).json({ error: "Unknown or unsafe generated dir." });
  res.json({ name: basename(dir), tree: buildTree(dir, dir) });
});

/** Contents of one generated file, with a detected language for highlighting. */
app.get("/api/generated/file", (req, res) => {
  const dir = generatedDir(req.query.dir);
  const rel = typeof req.query.path === "string" ? req.query.path : "";
  if (!dir) return res.status(400).json({ error: "Unknown or unsafe generated dir." });
  const target = resolve(dir, rel);
  if (!isInside(dir, target) || !existsSync(target) || statSync(target).isDirectory()) {
    return res.status(400).json({ error: "No such file." });
  }
  res.json({ path: rel, language: languageFor(target), content: readFileSync(target, "utf8") });
});

/** Whole-project zip (GET) — streams with the real directory structure preserved. */
app.get("/api/generated/zip", (req, res) => {
  const dir = generatedDir(req.query.dir);
  if (!dir) return res.status(400).json({ error: "Unknown or unsafe generated dir." });
  streamZip(res, basename(dir), (archive) => {
    archive.glob("**/*", { cwd: dir, dot: true, ignore: ["node_modules/**", ".git/**"] });
  });
});

/** Zip of a selected list of files (POST { dir, paths[] }). */
app.post("/api/generated/zip", (req, res) => {
  const { dir: dirIn, paths } = req.body as { dir?: string; paths?: string[] };
  const dir = generatedDir(dirIn);
  if (!dir) return res.status(400).json({ error: "Unknown or unsafe generated dir." });
  const list = (paths ?? []).filter((p) => isInside(dir, resolve(dir, p)));
  if (!list.length) return res.status(400).json({ error: "No valid paths selected." });
  streamZip(res, `${basename(dir)}-selection`, (archive) => {
    for (const p of list) {
      const abs = resolve(dir, p);
      if (existsSync(abs) && !statSync(abs).isDirectory()) archive.file(abs, { name: p });
    }
  });
});

function streamZip(res: express.Response, name: string, add: (a: archiver.Archiver) => void): void {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.zip"`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => res.status(500).end(String(err)));
  archive.pipe(res);
  add(archive);
  void archive.finalize();
}

/** Serve the built client if present (production). */
const clientDist = join(HERE, "..", "dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(join(clientDist, "index.html")));
}

interface TreeNode {
  name: string;
  path: string; // dir-relative, POSIX
  type: "dir" | "file";
  generated?: boolean;
  children?: TreeNode[];
}

/** Build a nested tree for the explorer; folders first, then files, both sorted. */
function buildTree(dir: string, rootDir: string): TreeNode[] {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.name !== "node_modules" && d.name !== ".git")
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  return entries.map((d) => {
    const full = join(dir, d.name);
    const rel = relative(rootDir, full).split(sep).join("/");
    const generated = /(^|\/)(generated|Generated)(\/|$)/.test(rel);
    return d.isDirectory()
      ? { name: d.name, path: rel, type: "dir", generated, children: buildTree(full, rootDir) }
      : { name: d.name, path: rel, type: "file", generated };
  });
}

function listTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name === "node_modules" || name === ".git") continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Map a file to a Prism language id by extension / name. */
function languageFor(file: string): string {
  const ext = extname(file).toLowerCase();
  const name = basename(file).toLowerCase();
  if (name.startsWith(".env")) return "bash";
  if (name === "dockerfile") return "docker";
  const byExt: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".php": "php",
    ".py": "python",
    ".json": "json",
    ".md": "markdown",
    ".sql": "sql",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".ini": "ini",
    ".sh": "bash",
    ".txt": "text",
    ".cfg": "ini",
  };
  return byExt[ext] ?? "text";
}

app.listen(PORT, () => {
  console.log(`Backbone pipeline server on http://localhost:${PORT} (repo: ${REPO_ROOT})`);
});
