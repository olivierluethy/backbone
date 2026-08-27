import { useState } from "react";
import { api, type SourceSnippet } from "../api";

/** A mono `file:line` link that reveals the source snippet in a popover. */
export function SourceRef({ root, file, line }: { root: string; file: string; line: number }) {
  const [open, setOpen] = useState(false);
  const [snippet, setSnippet] = useState<SourceSnippet | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!snippet && !error) {
      try {
        setSnippet(await api.source(root, file, line));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={toggle}
        className="mono text-info-500 hover:underline"
        title="Show source"
      >
        {file}:{line}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[420px] max-w-[80vw] rounded-md border border-rule bg-surface-raised shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="mono text-text-muted">{file}</span>
            <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text">
              ✕
            </button>
          </div>
          <div className="overflow-x-auto p-2">
            {error && <div className="mono text-danger-500">{error}</div>}
            {snippet?.lines.map((l) => (
              <div
                key={l.n}
                className={`mono flex gap-3 whitespace-pre px-1 ${
                  l.n === snippet.focus ? "bg-brass-050 text-brass-400" : "text-slate-200"
                }`}
              >
                <span className="w-8 shrink-0 text-right text-text-muted">{l.n}</span>
                <span>{l.text || " "}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
