import { useEffect, useMemo, useState } from "react";
import {
  serializeBlueprint,
  validateBlueprint,
  type Blueprint,
} from "@backbone/core";
import { api, type GenerateResult, type Meta } from "./api";
import { Rail, type Stage } from "./components/Rail";
import { BlueprintCanvas } from "./components/BlueprintCanvas";
import { AuthSummary, EndpointsTable } from "./components/EndpointsTable";
import { GeneratePanel } from "./components/GeneratePanel";
import { FolderPicker } from "./components/FolderPicker";
import { Button, Eyebrow } from "./components/primitives";

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [frontendPath, setFrontendPath] = useState("examples/demo-frontend");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<Stage>("analyze");

  const [runtime, setRuntimeState] = useState("node");
  const [architecture, setArchitecture] = useState("layered");
  const [dialect, setDialect] = useState("sqlite");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
  }, []);

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

  /** Switch runtime and reconcile the architecture/framework to one that runtime supports. */
  function setRuntime(next: string) {
    setRuntimeState(next);
    const archs = (meta?.presets ?? []).filter((p) => p.runtime === next).map((p) => p.architecture);
    if (archs.length && !archs.includes(architecture)) setArchitecture(archs[0]);
  }

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
      const res = await api.generate({ blueprint: outgoing, runtime, architecture, dialect });
      setResult(res);
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

  const root = blueprint?.meta.frontendPath ?? frontendPath;

  return (
    <div className="flex h-full max-[820px]:flex-col">
      <Rail stage={stage} onStage={setStage} reached={reached} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-ink-900 px-6 py-3">
          <label className="eyebrow">Frontend</label>
          <div className="flex min-w-[240px] flex-1 items-stretch overflow-hidden rounded-md border border-rule bg-ink-800 focus-within:border-brass-400">
            <input
              value={frontendPath}
              onChange={(e) => setFrontendPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              spellCheck={false}
              className="mono min-w-0 flex-1 bg-transparent px-3 py-1.5 text-text outline-none"
              placeholder="path to a React + TS project"
            />
            <button
              onClick={() => setPickerOpen(true)}
              className="border-l border-rule px-3 text-small font-semibold text-text-muted hover:bg-ink-600 hover:text-text"
              title="Browse for a folder"
            >
              Browse…
            </button>
          </div>
          <Button variant="primary" onClick={analyze} disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Analyze"}
          </Button>
          {blueprint && (
            <>
              <Button variant="ghost" onClick={download}>
                Download blueprint.json
              </Button>
              <Button variant="generate" onClick={generate} disabled={generating || issues.length > 0}>
                {generating ? "Generating…" : "Generate"}
              </Button>
            </>
          )}
        </header>

        <main className="min-w-0 flex-1 overflow-auto px-6 py-6">
          {analyzeError && (
            <div className="mb-4 rounded-md border border-danger-500/50 bg-danger-050 p-3 text-small text-danger-500">
              {analyzeError}
            </div>
          )}

          {!blueprint && <Welcome demo={meta?.demoPath} online={!!meta} />}

          {blueprint && stage === "analyze" && <Summary blueprint={blueprint} />}

          {blueprint && stage === "blueprint" && (
            <div className="space-y-8">
              {issues.length > 0 && (
                <div className="rounded-md border border-danger-500/50 bg-danger-050 p-3 text-small text-danger-500">
                  {issues.length} validation issue(s): {issues.map((i) => `${i.path}: ${i.message}`).join("; ")}
                </div>
              )}
              <BlueprintCanvas
                blueprint={blueprint}
                root={root}
                excluded={excluded}
                onToggleEntity={toggleEntity}
                onToggleField={toggleField}
              />
              <EndpointsTable blueprint={blueprint} root={root} onToggle={toggleEndpoint} />
              <AuthSummary blueprint={blueprint} />
            </div>
          )}

          {blueprint && (stage === "generate" || stage === "regenerate") && (
            <GeneratePanel
              blueprint={outgoing ?? blueprint}
              presets={meta?.presets ?? []}
              runtime={runtime}
              architecture={architecture}
              dialect={dialect}
              setRuntime={setRuntime}
              setArchitecture={setArchitecture}
              setDialect={setDialect}
              onGenerate={generate}
              generating={generating}
              result={result}
              error={genError}
            />
          )}
        </main>
      </div>

      <FolderPicker
        open={pickerOpen}
        initialPath={frontendPath && frontendPath.startsWith("/") ? frontendPath : meta?.repoRoot}
        onSelect={(path) => {
          setFrontendPath(path);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

function Welcome({ demo, online }: { demo?: string; online: boolean }) {
  return (
    <div className="drafting-grid relative flex min-h-[60vh] flex-col items-start justify-center rounded-md border border-line p-10">
      <div className="relative max-w-xl">
        <Eyebrow>Deterministic frontend → backend</Eyebrow>
        <h1 className="mt-3 font-display text-display font-semibold tracking-tight text-text">
          Draft a backend from your frontend.
        </h1>
        <p className="mt-4 text-body text-slate-200">
          Point Backbone at a React + TypeScript project. It reads the types and API calls, derives
          an editable Blueprint, and generates a runnable Node or PHP backend — the same input always
          produces the same output. No AI at any step.
        </p>
        <p className="mt-4 text-small text-text-muted">
          {online ? (
            <>
              Try the bundled demo: <span className="mono text-brass-400">{demo}</span> is prefilled
              above. Press <span className="mono">Analyze</span>.
            </>
          ) : (
            <span className="text-danger-500">
              Pipeline server unreachable — start it with <span className="mono">pnpm --filter @backbone/web server</span>.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function Summary({ blueprint }: { blueprint: Blueprint }) {
  return (
    <div className="space-y-4">
      <Eyebrow>Analysis</Eyebrow>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Entities", blueprint.entities.length],
          ["Endpoints", blueprint.endpoints.length],
          ["Auth", blueprint.auth.required ? "required" : "none"],
          ["Datastore", blueprint.datastore.required ? blueprint.datastore.dialect : "none"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-line bg-surface p-4">
            <div className="eyebrow">{k}</div>
            <div className="mt-1 font-display text-h1 text-text">{v}</div>
          </div>
        ))}
      </div>
      {blueprint.notes.length > 0 && (
        <div className="rounded-md border border-line bg-surface p-4">
          <Eyebrow count={blueprint.notes.length}>Notes</Eyebrow>
          <ul className="mt-2 space-y-1">
            {blueprint.notes.map((n, i) => (
              <li key={i} className="text-small text-text-muted">
                · {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-small text-text-muted">
        Open <span className="text-brass-400">Blueprint</span> to review and edit, then{" "}
        <span className="text-verd-400">Generate</span>.
      </p>
    </div>
  );
}
