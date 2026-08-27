import { useState } from "react";
import type { Blueprint } from "@backbone/core";
import { Rail } from "./components/Rail";
import { BlueprintCanvas } from "./components/BlueprintCanvas";
import { AuthSummary, EndpointsTable } from "./components/EndpointsTable";
import { GeneratePanel } from "./components/GeneratePanel";
import { FolderPicker } from "./components/FolderPicker";
import { FrontendBadge } from "./components/FrontendBadge";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Button, Eyebrow } from "./components/primitives";
import { useProject } from "./store/ProjectContext";

export default function App() {
  const {
    meta,
    frontendPath,
    setFrontendPath,
    blueprint,
    excluded,
    stage,
    setStage,
    analyzing,
    analyzeError,
    generating,
    result,
    outgoing,
    issues,
    reached,
    root,
    hasProjectData,
    analyze,
    generate,
    download,
    toggleEntity,
    toggleEndpoint,
    toggleField,
    clearProject,
  } = useProject();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

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
          {hasProjectData && (
            <Button variant="danger" onClick={() => setConfirmClear(true)} title="Remove this project's saved state">
              Clear project data
            </Button>
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
              <FrontendBadge frontend={blueprint.frontend} />
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
              vscodeAvailable={!!meta?.vscode}
              onGenerate={generate}
              generating={generating}
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

      <ConfirmDialog
        open={confirmClear}
        title="Clear project data"
        message="This removes the saved state for this project from your browser. Generated files on disk are not touched. This cannot be undone."
        bullets={["Blueprint", "Endpoints", "Database schema", "Directory / structure", "Change set"]}
        confirmLabel="Clear project data"
        onConfirm={() => {
          clearProject();
          setConfirmClear(false);
        }}
        onClose={() => setConfirmClear(false)}
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
      <FrontendBadge frontend={blueprint.frontend} />
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
