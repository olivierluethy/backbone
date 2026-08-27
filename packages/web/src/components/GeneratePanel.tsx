import { marked } from "marked";
import { summarizeDiff, type BlueprintDiff } from "@backbone/core";
import type { GenerateResult, PresetInfo } from "../api";
import { Button, Eyebrow } from "./primitives";

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
            className={`rounded-sm px-3 py-1 text-small font-medium transition-colors disabled:opacity-30 ${
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

export function GeneratePanel({
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
  const runtimes = [...new Set(presets.map((p) => p.runtime))];
  const archsForRuntime = presets.filter((p) => p.runtime === runtime).map((p) => p.architecture);
  const diffLines = result?.diff ? summarizeDiff(result.diff as BlueprintDiff) : [];

  return (
    <div>
      <Eyebrow>Generate</Eyebrow>
      <p className="mt-1 mb-4 text-small text-text-muted">
        Choose a runtime and architecture, then generate. Re-generating into the same output is
        additive — only the generated boundary is overwritten, and a new migration is added for
        schema changes.
      </p>

      <div className="flex flex-wrap items-end gap-6 rounded-md border border-line bg-surface p-4">
        <Segmented
          label="Runtime"
          value={runtime}
          onChange={setRuntime}
          options={runtimes.map((r) => ({ value: r, label: r }))}
        />
        <Segmented
          label="Architecture"
          value={architecture}
          onChange={setArchitecture}
          options={["layered", "modular"].map((a) => ({
            value: a,
            label: a,
            disabled: !archsForRuntime.includes(a as "layered" | "modular"),
          }))}
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
        <Button variant="generate" onClick={onGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate backend"}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-danger-500/50 bg-danger-050 p-3 text-small text-danger-500">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-6">
          <div className="rounded-md border border-verd-500/40 bg-verd-050 p-4">
            <div className="text-body text-verd-400">
              Generated <span className="font-semibold">{result.presetId}</span> →{" "}
              <span className="mono">{result.outDirRel}</span>
            </div>
            <div className="mt-1 text-small text-text-muted">
              {result.write.written.length} written · {result.write.skipped.length} preserved ·{" "}
              {result.migrationFilename
                ? `migration ${result.migrationFilename}`
                : "no migration change"}
            </div>
          </div>

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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
            <div>
              <Eyebrow>Generation report</Eyebrow>
              <div
                className="report-md mt-2 max-h-[50vh] overflow-auto rounded-md border border-line bg-surface p-4"
                dangerouslySetInnerHTML={{ __html: marked.parse(result.report) as string }}
              />
            </div>
            <div>
              <Eyebrow count={result.fileTree.length}>Files</Eyebrow>
              <div className="mono mt-2 max-h-[50vh] overflow-auto rounded-md border border-line bg-ink-800 p-3 text-text-muted">
                {result.fileTree.map((f) => (
                  <div key={f} className="whitespace-pre">
                    {f.includes("generated") || f.includes("Generated") ? (
                      <span className="text-verd-400">{f}</span>
                    ) : (
                      f
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
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
