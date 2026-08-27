import type { Blueprint } from "@backbone/core";
import type { GenerateResult } from "../api";

type Tone = "text" | "brass" | "verd" | "muted";

const toneClass: Record<Tone, string> = {
  text: "text-text",
  brass: "text-brass-400",
  verd: "text-verd-400",
  muted: "text-text-muted",
};

function Badge({ label, value, tone = "text", title }: { label: string; value: string; tone?: Tone; title?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5" title={title}>
      <div className="eyebrow text-text-muted">{label}</div>
      <div className={`mt-0.5 text-small font-semibold ${toneClass[tone]}`}>{value}</div>
    </div>
  );
}

/** Fully-formatted result summary — labelled badges, no terse fragments. */
export function StatusBadges({
  result,
  blueprint,
  runtime,
  framework,
  architecture,
  dialect,
}: {
  result: GenerateResult;
  blueprint: Blueprint;
  runtime: string;
  framework: string;
  architecture: string;
  dialect: string;
}) {
  const iso = result.generatedAt;
  const when = formatDateTime(iso);
  const activeEntities = blueprint.entities.filter((e) => e.generate).length;
  const activeEndpoints = blueprint.endpoints.filter((e) => e.generate).length;
  const isRegen = result.mode === "regenerate";

  return (
    <div className="rounded-md border border-verd-500/40 bg-verd-050 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`text-body font-semibold ${isRegen ? "text-brass-400" : "text-verd-400"}`}>
          {isRegen ? "Regenerated" : "Generated"}
        </span>
        <span className="mono text-small text-text">{result.outDirRel}</span>
        <span className="text-small text-text-muted">
          — {isRegen
            ? "additive: only the generated boundary was overwritten; your files were preserved."
            : "first generation into an empty target."}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Badge label="Mode" value={isRegen ? "Regenerate" : "Generate"} tone={isRegen ? "brass" : "verd"} />
        <Badge label="Runtime" value={runtime} tone="text" />
        <Badge label="Framework" value={framework} tone="text" />
        <Badge label="Architecture" value={architecture} tone="text" />
        <Badge label="Datastore" value={dialect} tone="text" />
        <Badge label="Auth" value={blueprint.auth.required ? "JWT" : "none"} tone={blueprint.auth.required ? "brass" : "muted"} />
        <Badge label="Entities" value={String(activeEntities)} tone="text" />
        <Badge label="Endpoints" value={String(activeEndpoints)} tone="text" />
        <Badge
          label="Files"
          value={`${result.write.written.length} written · ${result.write.skipped.length} preserved`}
          tone="text"
        />
        <Badge
          label="Migration"
          value={result.migrationFilename ? `+ ${result.migrationFilename}` : "none"}
          tone={result.migrationFilename ? "verd" : "muted"}
          title={result.migrationFilename ?? undefined}
        />
        <Badge label="Generated at" value={when} tone="muted" title={iso} />
      </div>
    </div>
  );
}

/** Locale-formatted "27 Aug 2026, 18:14" with graceful fallback. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
