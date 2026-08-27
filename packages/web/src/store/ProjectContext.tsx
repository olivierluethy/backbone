import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  serializeBlueprint,
  validateBlueprint,
  type Blueprint,
} from "@backbone/core";
import { api, type Capabilities, type GenerateResult, type Meta } from "../api";
import type { Stage } from "../components/Rail";
import { toast } from "../components/Toast";
import {
  clearProject as clearPersisted,
  getLastActiveId,
  loadProject,
  projectId,
  saveProject,
  type PersistedProject,
  type ResultTab,
  type Selections,
} from "./persistence";

/** The single working-state store for a project — hydrated from localStorage, autosaved on change. */
export interface ProjectContextValue {
  meta: Meta | null;
  caps: Capabilities | undefined;

  frontendPath: string;
  setFrontendPath: (v: string) => void;
  blueprint: Blueprint | null;
  excluded: Set<string>;
  stage: Stage;
  setStage: (s: Stage) => void;

  runtime: string;
  framework: string;
  architecture: string;
  dialect: string;
  setRuntime: (v: string) => void;
  setFramework: (v: string) => void;
  setArchitecture: (v: string) => void;
  setDialect: (v: string) => void;

  analyzing: boolean;
  analyzeError: string | null;
  generating: boolean;
  genError: string | null;
  result: GenerateResult | null;

  outgoing: Blueprint | null;
  issues: ReturnType<typeof validateBlueprint>;
  reached: Record<Stage, boolean>;
  root: string;
  hasProjectData: boolean;

  tab: ResultTab;
  setTab: (t: ResultTab) => void;
  expandedGroups: Record<string, boolean>;
  setGroupExpanded: (group: string, open: boolean) => void;

  analyze: () => Promise<void>;
  generate: () => Promise<void>;
  download: () => void;
  toggleEntity: (name: string, on: boolean) => void;
  toggleEndpoint: (index: number, on: boolean) => void;
  toggleField: (key: string, on: boolean) => void;
  clearProject: () => void;
}

const DEFAULT_SELECTIONS: Selections = {
  runtime: "node",
  framework: "express",
  architecture: "layered",
  dialect: "sqlite",
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

/** Read the last-active persisted project, if any, so the very first render is already hydrated. */
function loadInitial(): PersistedProject | null {
  const id = getLastActiveId();
  return id ? loadProject(id) : null;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [seed] = useState<PersistedProject | null>(loadInitial);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [frontendPath, setFrontendPath] = useState(seed?.frontendPath ?? "examples/demo-frontend");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(seed?.blueprint ?? null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set(seed?.excluded ?? []));
  const [stage, setStage] = useState<Stage>((seed?.ui.stage as Stage) ?? "analyze");

  const [runtime, setRuntimeState] = useState(seed?.selections.runtime ?? DEFAULT_SELECTIONS.runtime);
  const [framework, setFrameworkState] = useState(seed?.selections.framework ?? DEFAULT_SELECTIONS.framework);
  const [architecture, setArchitecture] = useState(
    seed?.selections.architecture ?? DEFAULT_SELECTIONS.architecture,
  );
  const [dialect, setDialect] = useState(seed?.selections.dialect ?? DEFAULT_SELECTIONS.dialect);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(seed?.result ?? null);

  const [tab, setTab] = useState<ResultTab>(seed?.ui.tab ?? "report");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    seed?.ui.expandedGroups ?? {},
  );

  const currentId = useRef<string | null>(seed?.id ?? null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
  }, []);

  const caps = meta?.capabilities as Capabilities | undefined;

  function setGroupExpanded(group: string, open: boolean) {
    setExpandedGroups((prev) => ({ ...prev, [group]: open }));
  }

  const reached: Record<Stage, boolean> = {
    analyze: true,
    blueprint: !!blueprint,
    generate: !!blueprint,
    regenerate: !!result,
  };

  async function analyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const { blueprint: bp } = await api.analyze(frontendPath);
      currentId.current = projectId(bp.meta.frontendPath ?? frontendPath);
      setBlueprint(bp);
      setExcluded(new Set());
      setResult(null);
      setStage("blueprint");
    } catch (e) {
      setAnalyzeError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleEntity(name: string, on: boolean) {
    setBlueprint((bp) =>
      bp ? { ...bp, entities: bp.entities.map((e) => (e.name === name ? { ...e, generate: on } : e)) } : bp,
    );
  }
  function toggleEndpoint(index: number, on: boolean) {
    setBlueprint((bp) =>
      bp ? { ...bp, endpoints: bp.endpoints.map((ep, i) => (i === index ? { ...ep, generate: on } : ep)) } : bp,
    );
  }
  function toggleField(key: string, on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * Switch runtime → pick that runtime's default framework → its default architecture. The framework
   * is ALWAYS reconciled so runtime and framework can never desync.
   */
  function setRuntime(next: string) {
    setRuntimeState(next);
    if (!caps) return;
    const fw =
      caps.defaultFrameworkByRuntime[next as keyof typeof caps.defaultFrameworkByRuntime] ??
      caps.frameworksByRuntime[next as keyof typeof caps.frameworksByRuntime]?.[0];
    if (fw) {
      setFrameworkState(fw);
      setArchitecture(caps.defaultArchitecture[fw]);
    }
  }

  /** Switch framework (the authoritative axis); runtime and architecture reconcile to it. */
  function setFramework(next: string) {
    setFrameworkState(next);
    if (!caps) return;
    const owningRuntime = caps.runtimeOfFramework[next as keyof typeof caps.runtimeOfFramework];
    if (owningRuntime) setRuntimeState(owningRuntime);
    const supported = caps.architecturesByFramework[next as keyof typeof caps.architecturesByFramework] ?? [];
    if (!supported.includes(architecture as never)) {
      setArchitecture(caps.defaultArchitecture[next as keyof typeof caps.defaultArchitecture]);
    }
  }

  // Self-heal any runtime/framework desync once capabilities are known. The framework wins.
  useEffect(() => {
    if (!caps) return;
    const owning = caps.runtimeOfFramework[framework as keyof typeof caps.runtimeOfFramework];
    if (owning && owning !== runtime) setRuntimeState(owning);
  }, [caps, framework, runtime]);

  /** The blueprint actually sent to the generator: excluded fields stripped. */
  const outgoing = useMemo<Blueprint | null>(() => {
    if (!blueprint) return null;
    return {
      ...blueprint,
      entities: blueprint.entities.map((e) => ({
        ...e,
        fields: e.fields.filter((f) => !excluded.has(`${e.name}.${f.name}`)),
      })),
    };
  }, [blueprint, excluded]);

  const issues = useMemo(() => (outgoing ? validateBlueprint(outgoing) : []), [outgoing]);

  async function generate() {
    if (!outgoing) return;
    setGenerating(true);
    setGenError(null);
    try {
      const effectiveRuntime =
        caps?.runtimeOfFramework[framework as keyof typeof caps.runtimeOfFramework] ?? runtime;
      const res = await api.generate({
        blueprint: outgoing,
        runtime: effectiveRuntime,
        framework,
        architecture,
        dialect,
      });
      setResult(res);
      setTab("report");
      setStage(res.diff ? "regenerate" : "generate");
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function download() {
    if (!outgoing) return;
    const blob = new Blob([serializeBlueprint(outgoing)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blueprint.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearProject() {
    if (currentId.current) clearPersisted(currentId.current);
    currentId.current = null;
    setBlueprint(null);
    setExcluded(new Set());
    setResult(null);
    setStage("analyze");
    setExpandedGroups({});
    setTab("report");
    setAnalyzeError(null);
    setGenError(null);
    toast("Project data cleared.", "success");
  }

  const root = blueprint?.meta.frontendPath ?? frontendPath;
  const hasProjectData = !!blueprint;

  // Autosave: persist the lightweight project state whenever it changes, but only once a project
  // actually exists (a blueprint has been analysed). Debounced so blueprint edits don't thrash.
  useEffect(() => {
    if (!blueprint) return;
    if (!currentId.current) currentId.current = projectId(root);
    const id = currentId.current;
    const handle = window.setTimeout(() => {
      saveProject({
        version: 1,
        id,
        frontendPath,
        blueprint,
        excluded: [...excluded],
        selections: { runtime, framework, architecture, dialect },
        result,
        ui: { stage, tab, expandedGroups },
        updatedAt: new Date().toISOString(),
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [
    blueprint,
    excluded,
    runtime,
    framework,
    architecture,
    dialect,
    result,
    stage,
    tab,
    expandedGroups,
    frontendPath,
    root,
  ]);

  const value: ProjectContextValue = {
    meta,
    caps,
    frontendPath,
    setFrontendPath,
    blueprint,
    excluded,
    stage,
    setStage,
    runtime,
    framework,
    architecture,
    dialect,
    setRuntime,
    setFramework,
    setArchitecture,
    setDialect,
    analyzing,
    analyzeError,
    generating,
    genError,
    result,
    outgoing,
    issues,
    reached,
    root,
    hasProjectData,
    tab,
    setTab,
    expandedGroups,
    setGroupExpanded,
    analyze,
    generate,
    download,
    toggleEntity,
    toggleEndpoint,
    toggleField,
    clearProject,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
