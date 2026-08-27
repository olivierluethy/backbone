import { useState } from "react";
import { api } from "../api";

/**
 * "Open in VS Code" action. Asks the pipeline server to shell out to the `code` CLI on the host
 * (opening the project folder or a single file). When the CLI is unavailable the button is
 * disabled with a tooltip; a `vscode://file/...` deep link returned by the server is used as a
 * best-effort fallback the browser can try to hand off to a locally installed VS Code.
 */
export function OpenInVscode({
  dir,
  path,
  available,
  label = "Open in VS Code",
  compact = false,
}: {
  dir: string;
  path?: string;
  available: boolean;
  label?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setNote(null);
    try {
      const res = await api.openVscode(dir, path);
      if (res.opened) {
        setNote("opened");
      } else {
        // Fallback: hand the deep link to the OS-registered handler.
        if (res.deepLink) window.location.href = res.deepLink;
        setNote(res.hint ? "cli-missing" : "deeplink");
      }
    } catch {
      setNote("error");
    } finally {
      setBusy(false);
      window.setTimeout(() => setNote(null), 4000);
    }
  }

  const base = compact
    ? "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-mono"
    : "inline-flex items-center gap-2 rounded-md border border-rule px-3 py-1.5 text-small font-medium";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={open}
        disabled={busy || !available}
        title={
          available
            ? `Open ${path ? "this file" : "the project"} in your local VS Code`
            : "The VS Code `code` CLI was not found on the server host. Install it via VS Code → Command Palette → 'Shell Command: Install code command in PATH'."
        }
        className={`${base} text-text-muted transition-colors hover:bg-ink-600 hover:text-text disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <VscodeGlyph />
        {label}
      </button>
      {note === "opened" && <span className="text-mono text-verd-400">✓ opening…</span>}
      {note === "deeplink" && <span className="text-mono text-text-muted">handed off via vscode://</span>}
      {note === "cli-missing" && <span className="text-mono text-warn-500">code CLI not found</span>}
      {note === "error" && <span className="text-mono text-danger-500">could not open</span>}
    </span>
  );
}

function VscodeGlyph() {
  // A neutral, on-palette square-bracket glyph — no external branding.
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden className="shrink-0">
      <path d="M2 2h3M2 2v3M11 2H8M11 2v3M2 11h3M2 11V8M11 11H8M11 11V8" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  );
}
