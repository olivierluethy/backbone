import { useEffect, useState } from "react";
import { marked } from "marked";
import { summarizeDiff, type Blueprint, type BlueprintDiff } from "@backbone/core";
import { api, type GenerateResult, type PresetInfo, type TargetStatus } from "../api";
import { Button, Eyebrow } from "./primitives";
import { StatusBadges } from "./StatusBadges";
import { FileExplorer } from "./FileExplorer";
import { StructureView } from "./StructureView";

/** A labelled segmented control. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="inline-flex rounded-md border border-rule p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-sm px-3 py-1 text-small font-medium capitalize transition-colors disabled:opacity-30 ${
              value === o.value ? "bg-ink-600 text-text" : "text-text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Tab = "report" | "files" | "structure";

export function GeneratePanel({
  blueprint,
  presets,
  runtime,
  architecture,
  dialect,
  setRuntime,
  setArchitecture,
  setDialect,
  onGenerate,
  generating,
  result,
  error,
}: {
  blueprint: Blueprint;
  presets: PresetInfo[];
  runtime: string;
  architecture: string;
  dialect: string;
  setRuntime: (v: string) => void;
  setArchitecture: (v: string) => void;
  setDialect: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  result: GenerateResult | null;
  error: string | null;
}) {
  const [status, setStatus] = useState<TargetStatus | null>(null);
  const [tab, setTab] = useState<Tab>("report");

  const runtimes = [...new Set(presets.map((p) => p.runtime))];
  const archsForRuntime = presets.filter((p) => p.runtime === runtime).map((p) => p.architecture);
  const isPython = runtime === "python";
  const archLabel = isPython ? "Framework" : "Architecture";

  // What mode would run right now (generate vs regenerate) at the resolved target?
  useEffect(() => {
    let alive = true;
    api
      .targetStatus(runtime, architecture)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [runtime, architecture, result]);

  useEffect(() => {
    if (result) setTab("report");
  }, [result]);

  const willRegenerate = status?.mode === "regenerate";
  const diffLines = result?.diff ? summarizeDiff(result.diff as BlueprintDiff) : [];

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
          options={runtimes.map((r) => ({ value: r, label: r }))}
        />
        <Segmented
          label={archLabel}
          value={architecture}
          onChange={setArchitecture}
          options={[...new Set(archsForRuntime)].map((a) => ({ value: a, label: a }))}
        />
        <Segmented
          label="Datastore"
          value={dialect}
          onChange={setDialect}
          options={[
            { value: "sqlite", label: "sqlite" },
            { value: "mysql", label: "mysql" },
          ]}
        />
        <div className="flex flex-col gap-1">
          <Button variant={willRegenerate ? "primary" : "generate"} onClick={onGenerate} disabled={generating}>
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

      {status && (
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
            architecture={architecture}
            dialect={dialect}
          />

          {diffLines.length > 0 && (
            <div>
              <Eyebrow count={diffLines.length}>Change set</Eyebrow>
              <div className="mt-2 overflow-x-auto rounded-md border border-line bg-ink-800 p-3">
                {diffLines.map((l, i) => (
                  <div key={i} className={`mono whitespace-pre ${diffColor(l)}`}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabbed results */}
          <div className="flex gap-1 border-b border-line">
            {(["report", "files", "structure"] as Tab[]).map((t) => (
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
          {tab === "files" && <FileExplorer dir={result.outDir} />}
          {tab === "structure" && <StructureView blueprint={blueprint} dir={result.outDir} />}
        </div>
      )}
    </div>
  );
}

function diffColor(line: string): string {
  if (line.startsWith("+")) return "text-verd-400";
  if (line.startsWith("-")) return "text-danger-500";
  if (line.startsWith("~")) return "text-brass-400";
  return "text-text-muted";
}
