#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseBlueprint,
  serializeBlueprint,
  summarizeDiff,
  type Architecture,
  type Runtime,
} from "@backbone/core";
import { analyzeFrontend } from "@backbone/analyzer";
import { generateBackend, listPresets } from "@backbone/generators";
import { printBlueprintSummary } from "./summary.js";
import { eyebrow, ui } from "./ui.js";

interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

function fail(msg: string): never {
  console.error(ui.danger("error: ") + msg);
  process.exit(1);
}

const HELP = `${ui.bold("bb")} — Backbone: deterministic frontend → backend generator

${eyebrow("Usage")}
  bb analyze <frontendPath> [--out blueprint.json]
  bb review [blueprint.json]
  bb generate <blueprint.json | frontendPath> --runtime <node|php|python> [--arch <layered|modular> | --framework <fastapi|django>] --out <dir> [--dialect sqlite|mysql]
  bb regenerate --out <dir> [--frontend <path>] [--runtime … --framework …]
  bb presets

${eyebrow("Notes")}
  Analysis and generation are deterministic — no AI at any step.
  Regeneration is additive: it overwrites only the generated/ boundary and never
  edits old migrations or your own code.`;

function cmdAnalyze(args: Args): void {
  const frontend = args._[0];
  if (!frontend) fail("analyze needs a frontend path. Try: bb analyze ./my-app");
  const bp = analyzeFrontend(resolve(frontend));
  const out = typeof args.flags.out === "string" ? args.flags.out : "blueprint.json";
  writeFileSync(out, serializeBlueprint(bp));
  printBlueprintSummary(bp);
  console.log(ui.verd("✓ ") + `Blueprint written to ${ui.bold(out)}`);
}

function cmdReview(args: Args): void {
  const path = args._[0] ?? "blueprint.json";
  if (!existsSync(path)) fail(`no blueprint at ${path}. Run: bb analyze <frontendPath>`);
  const bp = parseBlueprint(readFileSync(path, "utf8"));
  printBlueprintSummary(bp);
}

/** `--framework` is an alias for `--arch` (Python's framework is the architecture slot). */
function resolveArchitecture(args: Args, runtime: Runtime): Architecture {
  const explicit = args.flags.framework ?? args.flags.arch;
  if (typeof explicit === "string") return explicit as Architecture;
  return (runtime === "python" ? "fastapi" : "layered") as Architecture;
}

function cmdGenerate(args: Args): void {
  const src = args._[0];
  if (!src) fail("generate needs a blueprint.json or a frontend path.");
  const runtime = String(args.flags.runtime ?? "node") as Runtime;
  const architecture = resolveArchitecture(args, runtime);
  const outDir = args.flags.out;
  if (typeof outDir !== "string") fail("generate needs --out <dir>.");
  const dialect = args.flags.dialect === "mysql" ? "mysql" : "sqlite";

  const bp =
    src.endsWith(".json") && existsSync(src)
      ? parseBlueprint(readFileSync(src, "utf8"))
      : analyzeFrontend(resolve(src));

  const res = generateBackend(bp, { runtime, architecture, outDir: resolve(outDir), dialect });
  reportGeneration(res);
}

function cmdRegenerate(args: Args): void {
  const outDir = args.flags.out;
  if (typeof outDir !== "string") fail("regenerate needs --out <dir>.");
  const lockPath = resolve(outDir, "blueprint.lock.json");
  if (!existsSync(lockPath)) fail(`no previous generation at ${outDir} (missing blueprint.lock.json).`);
  const lock = parseBlueprint(readFileSync(lockPath, "utf8"));
  const frontend =
    typeof args.flags.frontend === "string" ? args.flags.frontend : lock.meta.frontendPath;
  if (!frontend || !existsSync(frontend)) {
    fail(`cannot find the frontend to re-analyse. Pass --frontend <path>.`);
  }
  const bp = analyzeFrontend(resolve(frontend));
  // Runtime/arch aren't stored in the lock; default to node/layered unless overridden.
  const runtime = String(args.flags.runtime ?? "node") as Runtime;
  const architecture = resolveArchitecture(args, runtime);
  const dialect = args.flags.dialect === "mysql" ? "mysql" : lock.datastore.dialect;

  const res = generateBackend(bp, { runtime, architecture, outDir: resolve(outDir), dialect });
  if (res.diff) {
    const lines = summarizeDiff(res.diff);
    console.log("");
    console.log(eyebrow("Change set"));
    if (lines.length === 0) console.log(ui.muted("  no Blueprint changes — code refreshed, no new migration."));
    else lines.forEach((l) => console.log("  " + diffColor(l)));
  }
  reportGeneration(res);
}

function cmdPresets(): void {
  console.log("");
  console.log(eyebrow("Template sets"));
  for (const p of listPresets()) {
    console.log(`  ${ui.verd("▪")} ${ui.bold(p.id)} ${ui.muted(`(${p.runtime} / ${p.architecture})`)}`);
  }
  console.log("");
}

function reportGeneration(res: ReturnType<typeof generateBackend>): void {
  console.log("");
  console.log(ui.verd("✓ ") + `Generated ${ui.bold(res.presetId)} backend → ${ui.bold(res.outDir)}`);
  console.log(
    ui.muted(
      `  ${res.write.written.length} written, ${res.write.skipped.length} preserved` +
        (res.migrationFilename ? `, migration ${res.migrationFilename}` : ", no migration change"),
    ),
  );
  console.log(ui.muted(`  see GENERATION_REPORT.md for full traceability.`));
  console.log("");
}

function diffColor(line: string): string {
  if (line.startsWith("+")) return ui.verd(line);
  if (line.startsWith("-")) return ui.danger(line);
  if (line.startsWith("~")) return ui.brass(line);
  return line;
}

function main(): void {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const cmd = _[0];
  const rest: Args = { _: _.slice(1), flags };

  switch (cmd) {
    case "analyze":
      return cmdAnalyze(rest);
    case "review":
      return cmdReview(rest);
    case "generate":
      return cmdGenerate(rest);
    case "regenerate":
      return cmdRegenerate(rest);
    case "presets":
      return cmdPresets();
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      fail(`unknown command "${cmd}". Run bb --help.`);
  }
}

main();
