import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import express from "express";
import cors from "cors";
import { canonicalizeBlueprint, type Blueprint } from "@backbone/core";
import { analyzeFrontend } from "@backbone/analyzer";
import { generateBackend, listPresets } from "@backbone/generators";

/**
 * Thin pipeline server. It runs the deterministic analyzer/generators on disk — there is no
 * AI here and no state beyond the filesystem. The React client drives every step.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const PORT = Number(process.env.WEB_SERVER_PORT ?? 5411);

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

/** Resolve a user-supplied path against the repo root when relative. */
function resolvePath(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

app.get("/api/meta", (_req, res) => {
  res.json({ repoRoot: REPO_ROOT, demoPath: "examples/demo-frontend", presets: listPresets() });
});

app.get("/api/presets", (_req, res) => {
  res.json(listPresets());
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

app.post("/api/generate", (req, res) => {
  const { blueprint, runtime, architecture, dialect, outDir } = req.body as {
    blueprint?: Blueprint;
    runtime?: "node" | "php";
    architecture?: "layered" | "modular";
    dialect?: "sqlite" | "mysql";
    outDir?: string;
  };
  if (!blueprint) return res.status(400).json({ error: "blueprint is required." });
  const rt = runtime ?? "node";
  const arch = architecture ?? "layered";
  const target = outDir
    ? resolvePath(outDir)
    : join(REPO_ROOT, "generated-backends", `${rt}-${arch}`);
  try {
    const result = generateBackend(blueprint, {
      runtime: rt,
      architecture: arch,
      outDir: target,
      dialect: dialect ?? "sqlite",
    });
    return res.json({
      ...result,
      outDirRel: relative(REPO_ROOT, result.outDir),
      fileTree: listTree(result.outDir).map((f) => relative(result.outDir, f)),
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
  // Guard against path traversal — the file must stay under the analysed root.
  if (!target.startsWith(base)) return res.status(400).json({ error: "Path outside root." });
  if (!existsSync(target)) return res.status(400).json({ error: `No such file: ${file}` });
  const all = readFileSync(target, "utf8").split("\n");
  const focus = line ?? 1;
  const from = Math.max(1, focus - 3);
  const to = Math.min(all.length, focus + 3);
  const lines: Array<{ n: number; text: string }> = [];
  for (let n = from; n <= to; n++) lines.push({ n, text: all[n - 1] ?? "" });
  res.json({ file, focus, lines });
});

/** Serve the built client if present (production). */
const clientDist = join(HERE, "..", "dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(join(clientDist, "index.html")));
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

app.listen(PORT, () => {
  console.log(`Backbone pipeline server on http://localhost:${PORT} (repo: ${REPO_ROOT})`);
});
