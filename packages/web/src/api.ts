import type { Blueprint } from "@backbone/core";

/** Client for the pipeline server. Every call is a deterministic pipeline step. */

export interface PresetInfo {
  id: string;
  runtime: "node" | "php";
  architecture: "layered" | "modular";
  label: string;
}

export interface Meta {
  repoRoot: string;
  demoPath: string;
  presets: PresetInfo[];
}

export interface GenerateResult {
  outDir: string;
  outDirRel: string;
  presetId: string;
  write: { written: string[]; skipped: string[] };
  migrationFilename: string | null;
  diff: unknown | null;
  report: string;
  fileCount: number;
  fileTree: string[];
}

export interface SourceSnippet {
  file: string;
  focus: number;
  lines: Array<{ n: number; text: string }>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  meta: async (): Promise<Meta> => {
    const res = await fetch("/api/meta");
    if (!res.ok) throw new Error("Could not reach the pipeline server.");
    return res.json();
  },
  analyze: (frontendPath: string) =>
    post<{ blueprint: Blueprint }>("/api/analyze", { frontendPath }),
  generate: (args: {
    blueprint: Blueprint;
    runtime: string;
    architecture: string;
    dialect: string;
    outDir?: string;
  }) => post<GenerateResult>("/api/generate", args),
  source: (root: string, file: string, line: number) =>
    post<SourceSnippet>("/api/source", { root, file, line }),
};
