import type { Blueprint } from "@backbone/core";

/** Client for the pipeline server. Every call is a deterministic pipeline step. */

export interface PresetInfo {
  id: string;
  runtime: string;
  architecture: string;
  label: string;
}

export interface Meta {
  repoRoot: string;
  home: string;
  demoPath: string;
  presets: PresetInfo[];
}

export interface GenerateResult {
  outDir: string;
  outDirRel: string;
  presetId: string;
  mode: "generate" | "regenerate";
  generatedAt: string;
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

export interface DirEntry {
  name: string;
  path: string;
  hasChildren: boolean;
}
export interface FsListing {
  current: string;
  parent: string | null;
  home: string;
  repoRoot: string;
  looksLikeProject: boolean;
  dirs: DirEntry[];
}

export interface TargetStatus {
  target: string;
  targetRel: string;
  exists: boolean;
  lockExists: boolean;
  mode: "generate" | "regenerate";
}

export interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  generated?: boolean;
  children?: TreeNode[];
}

export interface FileContent {
  path: string;
  language: string;
  content: string;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
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

/** Trigger a browser download of a blob from a URL (GET) or a POST body. */
async function download(url: string, init?: RequestInit, fallbackName = "download"): Promise<void> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const name = match?.[1] ?? fallbackName;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export const api = {
  meta: async (): Promise<Meta> => {
    const res = await fetch("/api/meta");
    if (!res.ok) throw new Error("Could not reach the pipeline server.");
    return res.json();
  },
  fsList: (path?: string) =>
    get<FsListing>(`/api/fs/list${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  analyze: (frontendPath: string) =>
    post<{ blueprint: Blueprint }>("/api/analyze", { frontendPath }),
  targetStatus: (runtime: string, architecture: string) =>
    get<TargetStatus>(
      `/api/target-status?runtime=${encodeURIComponent(runtime)}&architecture=${encodeURIComponent(architecture)}`,
    ),
  generate: (args: {
    blueprint: Blueprint;
    runtime: string;
    architecture: string;
    dialect: string;
    outDir?: string;
  }) => post<GenerateResult>("/api/generate", args),
  source: (root: string, file: string, line: number) =>
    post<SourceSnippet>("/api/source", { root, file, line }),
  generatedTree: (dir: string) =>
    get<{ name: string; tree: TreeNode[] }>(`/api/generated/tree?dir=${encodeURIComponent(dir)}`),
  generatedFile: (dir: string, path: string) =>
    get<FileContent>(
      `/api/generated/file?dir=${encodeURIComponent(dir)}&path=${encodeURIComponent(path)}`,
    ),
  downloadProject: (dir: string) =>
    download(`/api/generated/zip?dir=${encodeURIComponent(dir)}`, undefined, "backend.zip"),
  downloadSelected: (dir: string, paths: string[]) =>
    download(
      "/api/generated/zip",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir, paths }),
      },
      "selection.zip",
    ),
  downloadFile: async (dir: string, path: string) => {
    const { content } = await api.generatedFile(dir, path);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() ?? "file";
    a.click();
    URL.revokeObjectURL(url);
  },
};
