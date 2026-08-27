import { useEffect, useState } from "react";
import { marked } from "marked";
import {
  type Architecture,
  type Blueprint,
  type BlueprintDiff,
  type Framework,
  type Runtime,
} from "@backbone/core";
import { api, type TargetStatus } from "../api";
import { Button, Eyebrow } from "./primitives";
import { StatusBadges } from "./StatusBadges";
import { FileExplorer } from "./FileExplorer";
import { StructureView } from "./StructureView";
import { DatabaseView } from "./DatabaseView";
import { ChangeSet } from "./ChangeSet";
import { OpenInVscode } from "./OpenInVscode";
import { useProject } from "../store/ProjectContext";
import type { ResultTab } from "../store/persistence";

/** A labelled segmented control. Options may be disabled with an explanatory tooltip. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean; title?: string; muted?: boolean }>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="inline-flex flex-wrap rounded-md border border-rule p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`rounded-sm px-3 py-1 text-small font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
              value === o.value
                ? "bg-ink-600 text-text"
                : o.muted
                  ? "text-slate-300 hover:text-text"
                  : "text-text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GeneratePanel({
  blueprint,
  vscodeAvailable,
  onGenerate,
  generating,
}: {
  blueprint: Blueprint;
  vscodeAvailable: boolean;
  onGenerate: () => void;
  generating: boolean;
}) {
  const {
    caps,
    runtime,
    framework,
    architecture,
    dialect,
    setRuntime,
    setFramework,
    setArchitecture,
    setDialect,
    result,
    genError: error,
    tab,
    setTab,
  } = useProject();
  const [status, setStatus] = useState<TargetStatus | null>(null);
  const runtimes = caps?.runtimes ?? (["node", "php", "python"] as Runtime[]);
  const frameworksForRuntime = caps?.frameworksByRuntime?.[runtime as Runtime] ?? [];
  const fwCaps = caps?.frameworks?.[framework as Framework];
  const archOptions = fwCaps?.architectures ?? [];
  const archDescription = archOptions.find((a) => a.id === architecture)?.description;
  // Selecting an unsupported architecture is blocked; unregistered ones are shown but disabled.
  const selectedArch = archOptions.find((a) => a.id === architecture);
  const canGenerate = !selectedArch || selectedArch.registered;

  // What mode would run right now (generate vs regenerate) at the resolved target?
  useEffect(() => {
    let alive = true;
    api
      .targetStatus(runtime, framework, architecture)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [runtime, framework, architecture, result]);

  const willRegenerate = status?.mode === "regenerate";

  return (
    <div>
      <Eyebrow>Generate</Eyebrow>
      <p className="mt-1 mb-4 max-w-3xl text-small text-text-muted">
        <span className="text-text">Generate</span> writes the backend into an empty target.{" "}
        <span className="text-text">Regenerate</span> re-runs against an existing target: it diffs the
        Blueprint, appends an additive migration for schema changes, and overwrites only the generated
        boundary — your own files are preserved.
      </p>

      <div className="flex flex-wrap items-end gap-6 rounded-md border border-line bg-surface p-4">
        <Segmented
          label="Runtime"
          value={runtime}
          onChange={setRuntime}
          options={runtimes.map((r) => ({ value: r, label: caps?.runtimeLabels?.[r as Runtime] ?? r }))}
        />
        <Segmented
          label="Framework"
          value={framework}
          onChange={setFramework}
          options={frameworksForRuntime.map((f) => ({
            value: f,
            label: caps?.frameworkLabels?.[f as Framework] ?? f,
          }))}
        />
        <Segmented
          label="Architecture"
          value={architecture}
          onChange={setArchitecture}
          options={archOptions.map((a) => ({
            value: a.id,
            label: a.label + (a.isDefault ? " ★" : ""),
            disabled: !a.supported || !a.registered,
            muted: a.supported && !a.registered,
            title: !a.supported
              ? (a.reason ?? undefined)
              : !a.registered
                ? `${a.label} is a valid ${fwCaps?.label ?? framework} pattern but is not generatable in this build yet.`
                : a.description,
          }))}
        />
        <Segmented
          label="Datastore"
          value={dialect}
          onChange={setDialect}
          options={[
            { value: "sqlite", label: "SQLite" },
            { value: "mysql", label: "MySQL" },
          ]}
        />
        <div className="flex flex-col gap-1">
          <Button
            variant={willRegenerate ? "primary" : "generate"}
            onClick={onGenerate}
            disabled={generating || !canGenerate}
          >
            {generating
              ? willRegenerate
                ? "Regenerating…"
                : "Generating…"
              : willRegenerate
                ? "Regenerate backend"
                : "Generate backend"}
          </Button>
        </div>
      </div>

      {archDescription && (
        <p className="mt-2 max-w-3xl text-small text-text-muted">
          <span className="eyebrow mr-2 text-slate-300">{selectedArch?.label}</span>
          {archDescription}
        </p>
      )}

      {status && canGenerate && (
        <p className="mt-2 text-small text-text-muted">
          {willRegenerate ? (
            <>
              <span className="text-brass-400">Regenerate</span> — target{" "}
              <span className="mono">{status.targetRel}</span> already exists (has a lock).
            </>
          ) : (
            <>
              <span className="text-verd-400">Generate</span> — new target{" "}
              <span className="mono">{status.targetRel}</span>.
            </>
          )}
        </p>
      )}

      {status?.runtimeSwitch && canGenerate && (
        <p className="mt-1 text-small text-warn-500">
          This target was last generated as{" "}
          <span className="mono">
            {status.runtimeSwitch.runtime}/{status.runtimeSwitch.framework}
          </span>
          . Regenerating will switch it to {runtime}/{framework} and remove the previous runtime's files.
        </p>
      )}

      {!canGenerate && (
        <p className="mt-2 text-small text-warn-500">
          {selectedArch?.label} is offered for {fwCaps?.label ?? framework} but not generatable in this
          build yet — pick another architecture.
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-danger-500/50 bg-danger-050 p-3 text-small text-danger-500">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-5">
          <StatusBadges
            result={result}
            blueprint={blueprint}
            runtime={runtime}
            framework={caps?.frameworkLabels?.[framework as Framework] ?? framework}
            architecture={caps?.architectureLabels?.[architecture as Architecture] ?? architecture}
            dialect={dialect}
          />

          <div className="flex flex-wrap items-center gap-3">
            <OpenInVscode dir={result.outDir} available={vscodeAvailable} label="Open project in VS Code" />
            <span className="text-small text-text-muted">
              or download the project from the <span className="text-text">Files</span> tab.
            </span>
          </div>

          {result.diff ? <ChangeSet diff={result.diff as BlueprintDiff} /> : null}

          {/* Tabbed results */}
          <div className="flex gap-1 border-b border-line">
            {(["report", "files", "database", "structure"] as ResultTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-small font-medium capitalize transition-colors ${
                  tab === t ? "border-brass-500 text-text" : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "report" && (
            <div
              className="report-md max-h-[62vh] overflow-auto rounded-md border border-line bg-surface p-4"
              dangerouslySetInnerHTML={{ __html: marked.parse(result.report) as string }}
            />
          )}
          {tab === "files" && (
            <FileExplorer dir={result.outDir} vscodeAvailable={vscodeAvailable} refreshKey={result.generatedAt} />
          )}
          {tab === "database" && <DatabaseView blueprint={blueprint} />}
          {tab === "structure" && (
            <StructureView blueprint={blueprint} dir={result.outDir} refreshKey={result.generatedAt} />
          )}
        </div>
      )}
    </div>
  );
}
