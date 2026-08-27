export type Stage = "analyze" | "blueprint" | "generate" | "regenerate";

const STAGES: Array<{ id: Stage; index: string; label: string; note: string }> = [
  { id: "analyze", index: "01", label: "Analyze", note: "read the frontend" },
  { id: "blueprint", index: "02", label: "Blueprint", note: "review & edit" },
  { id: "generate", index: "03", label: "Generate", note: "emit the backend" },
  { id: "regenerate", index: "04", label: "Regenerate", note: "additive diff" },
];

/** The measured spine — a ruled edge with 24px ticks — carrying the four pipeline stages. */
export function Rail({
  stage,
  onStage,
  reached,
}: {
  stage: Stage;
  onStage: (s: Stage) => void;
  reached: Record<Stage, boolean>;
}) {
  return (
    <nav className="relative flex w-[248px] shrink-0 flex-col border-r border-line bg-ink-900 max-[820px]:w-full max-[820px]:flex-row max-[820px]:border-b">
      {/* spine rule + ticks */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-full w-0.5 bg-rule max-[820px]:hidden"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, var(--rule) 0 6px, transparent 6px 24px)",
        }}
      />
      <div className="px-6 py-5 max-[820px]:py-4">
        <div className="font-display text-h2 font-bold tracking-tight text-text">Backbone</div>
        <div className="eyebrow mt-1">deterministic · no ai</div>
      </div>
      <ol className="flex flex-1 flex-col gap-1 px-3 max-[820px]:flex-row max-[820px]:items-center max-[820px]:overflow-x-auto">
        {STAGES.map((s) => {
          const active = stage === s.id;
          const enabled = reached[s.id];
          return (
            <li key={s.id}>
              <button
                disabled={!enabled}
                onClick={() => onStage(s.id)}
                className={`group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                  active ? "bg-ink-700" : "hover:bg-ink-800"
                } disabled:opacity-40`}
              >
                <span
                  className={`mono text-eyebrow ${active ? "text-brass-500" : "text-text-muted"}`}
                >
                  {s.index}
                </span>
                <span className="flex flex-col">
                  <span className={`text-h3 font-semibold ${active ? "text-text" : "text-slate-200"}`}>
                    {s.label}
                  </span>
                  <span className="text-eyebrow text-text-muted max-[820px]:hidden">{s.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
