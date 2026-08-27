import type { Blueprint } from "@backbone/core";
import type { GenerateResult } from "../api";

/**
 * Per-project client-side persistence. The full *lightweight* working state of a project is kept in
 * `localStorage` so nothing is lost when navigating Analyze / Blueprint / Generate or on a full page
 * reload. Generated file *contents* are never stored here — they live on disk in the output directory
 * and are re-fetched from the pipeline server on demand; the store only remembers the output-dir path
 * (inside `result`) and the selections so the Files / Database / Structure views can re-hydrate.
 *
 * Decision: `localStorage` only. The payload is intentionally light (no file contents), so an
 * IndexedDB fallback is unnecessary; quota errors are caught and logged rather than crashing the app.
 */

export interface Selections {
  runtime: string;
  framework: string;
  architecture: string;
  dialect: string;
}

export type StageId = "analyze" | "blueprint" | "generate" | "regenerate";
export type ResultTab = "report" | "files" | "database" | "structure";

export interface ProjectUi {
  stage: StageId;
  tab: ResultTab;
  /** Collapse state of grouped endpoints, keyed by resource name. */
  expandedGroups: Record<string, boolean>;
}

export interface PersistedProject {
  version: number;
  id: string;
  frontendPath: string;
  blueprint: Blueprint | null;
  /** Serialized `Set<string>` of excluded `Entity.field` keys. */
  excluded: string[];
  selections: Selections;
  result: GenerateResult | null;
  ui: ProjectUi;
  updatedAt: string;
}

const VERSION = 1;
const KEY_PREFIX = "bb:proj:";
const INDEX_KEY = "bb:proj:index";
const LAST_ACTIVE_KEY = "bb:proj:last-active";
/** Above this serialized size we drop the (re-derivable) report before giving up. ~4.5MB. */
const SOFT_LIMIT = 4_500_000;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Stable, collision-resistant id derived from the analysed frontend path. */
export function projectId(frontendPath: string): string {
  const norm = frontendPath.replace(/\/+$/, "");
  const slug =
    norm
      .split("/")
      .filter(Boolean)
      .slice(-2)
      .join("-")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40) || "project";
  // djb2 hash of the full path so two different projects with the same tail can't collide.
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return `${slug}-${(h >>> 0).toString(36)}`;
}

function keyFor(id: string): string {
  return KEY_PREFIX + id;
}

export function loadProject(id: string): PersistedProject | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(keyFor(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProject;
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch (err) {
    console.warn("[backbone] failed to load persisted project", id, err);
    return null;
  }
}

export function saveProject(project: PersistedProject): void {
  const s = storage();
  if (!s) return;
  const record: PersistedProject = { ...project, version: VERSION, updatedAt: new Date().toISOString() };
  try {
    write(s, record);
  } catch (err) {
    // Over quota: shed the largest re-derivable field (the report) and retry once.
    try {
      const trimmed: PersistedProject = {
        ...record,
        result: record.result ? { ...record.result, report: "" } : null,
      };
      write(s, trimmed);
      console.warn("[backbone] project state near quota — persisted without the report", project.id);
    } catch (err2) {
      console.warn("[backbone] could not persist project state (quota)", project.id, err2);
    }
  }
}

function write(s: Storage, record: PersistedProject): void {
  const serialized = JSON.stringify(record);
  if (serialized.length > SOFT_LIMIT) {
    const trimmed = JSON.stringify({
      ...record,
      result: record.result ? { ...record.result, report: "" } : null,
    });
    s.setItem(keyFor(record.id), trimmed);
  } else {
    s.setItem(keyFor(record.id), serialized);
  }
  addToIndex(s, record.id);
  s.setItem(LAST_ACTIVE_KEY, record.id);
}

export function clearProject(id: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(keyFor(id));
    removeFromIndex(s, id);
    if (s.getItem(LAST_ACTIVE_KEY) === id) s.removeItem(LAST_ACTIVE_KEY);
  } catch (err) {
    console.warn("[backbone] failed to clear persisted project", id, err);
  }
}

export function getLastActiveId(): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(LAST_ACTIVE_KEY);
  } catch {
    return null;
  }
}

export interface ProjectIndexEntry {
  id: string;
  updatedAt: string;
}

function readIndex(s: Storage): string[] {
  try {
    const raw = s.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function addToIndex(s: Storage, id: string): void {
  const ids = readIndex(s);
  if (!ids.includes(id)) {
    ids.push(id);
    s.setItem(INDEX_KEY, JSON.stringify(ids));
  }
}

function removeFromIndex(s: Storage, id: string): void {
  const ids = readIndex(s).filter((x) => x !== id);
  s.setItem(INDEX_KEY, JSON.stringify(ids));
}

export function listProjects(): ProjectIndexEntry[] {
  const s = storage();
  if (!s) return [];
  return readIndex(s)
    .map((id) => {
      const p = loadProject(id);
      return p ? { id, updatedAt: p.updatedAt } : null;
    })
    .filter((x): x is ProjectIndexEntry => x !== null);
}
