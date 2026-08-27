import { useEffect, useState, type ReactNode } from "react";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { ensurePrismLanguages } from "./prism-setup";

/** Syntax palette mapped to the Backbone tokens (styleguide 6.3) — no rainbow. */
const theme: PrismTheme = {
  plain: { color: "var(--paper-100)", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "var(--slate-300)", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "var(--slate-200)" } },
    { types: ["keyword", "tag", "selector", "important", "atrule"], style: { color: "var(--brass-400)" } },
    { types: ["operator", "entity", "url", "variable"], style: { color: "var(--brass-500)" } },
    { types: ["string", "char", "attr-value", "regex", "inserted"], style: { color: "var(--verd-400)" } },
    { types: ["number", "boolean", "constant", "symbol"], style: { color: "var(--info-500)" } },
    { types: ["function", "class-name", "attr-name", "property"], style: { color: "var(--paper-100)" } },
    { types: ["namespace", "deleted"], style: { color: "var(--text-muted)" } },
  ],
};

export function CodeViewer({
  path,
  language,
  content,
  fontSize = 12,
  onCopy,
  onDownload,
  actions,
}: {
  path: string;
  language: string;
  content: string;
  /** Editor font size in px (driven by the explorer's zoom control). */
  fontSize?: number;
  onCopy?: () => void;
  onDownload?: () => void;
  /** Extra header actions (e.g. Split, Open in VS Code) rendered before Copy/Download. */
  actions?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [langsReady, setLangsReady] = useState(false);
  const lineHeight = Math.round(fontSize * 1.5);

  // Load the extra Prism grammars once, then re-render to apply highlighting.
  useEffect(() => {
    let alive = true;
    ensurePrismLanguages().then(() => alive && setLangsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  function copy() {
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      onCopy?.();
    });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-ink-800 px-3 py-1.5">
        <span className="mono truncate text-mono text-text-muted" title={path}>
          {path}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {actions}
          <IconButton label={copied ? "Copied" : "Copy"} onClick={copy} active={copied} />
          {onDownload && <IconButton label="Download" onClick={onDownload} />}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-ink-800">
        <Highlight key={langsReady ? "hl" : "plain"} theme={theme} code={content.replace(/\n$/, "")} language={language}>
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className="mono min-w-max py-2"
              style={{ ...style, background: "transparent", fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
            >
              {tokens.map((line, i) => {
                const lineProps = getLineProps({ line });
                return (
                  <div key={i} {...lineProps} className={`flex ${lineProps.className ?? ""}`}>
                    <span
                      className="sticky left-0 mr-3 shrink-0 select-none border-r border-line bg-ink-800 pr-2 text-right text-slate-300"
                      style={{ width: `${Math.max(32, String(tokens.length).length * 9 + 16)}px` }}
                    >
                      {i + 1}
                    </span>
                    <span className="pr-4">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border border-rule px-2 py-0.5 text-eyebrow font-semibold uppercase tracking-eyebrow transition-colors hover:bg-ink-600 ${
        active ? "text-verd-400" : "text-text-muted"
      }`}
    >
      {label}
    </button>
  );
}
