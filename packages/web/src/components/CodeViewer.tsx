import { useEffect, useState, type ReactNode } from "react";
import { Highlight } from "prism-react-renderer";
import { ensurePrismLanguages } from "./prism-setup";
import { prismTheme as theme } from "./prismTheme";
import { MarkdownView } from "./MarkdownView";

/** True for files that offer a rendered Markdown preview. */
export function isMarkdown(path: string, language?: string): boolean {
  return language === "markdown" || /\.(md|markdown|mdx)$/i.test(path);
}

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
  const markdown = isMarkdown(path, language);
  // Markdown defaults to the rendered preview; the toggle only appears for Markdown files.
  const [view, setView] = useState<"rendered" | "source">(markdown ? "rendered" : "source");
  const lineHeight = Math.round(fontSize * 1.5);

  // Keep the default correct when the open file changes (e.g. switching tabs).
  useEffect(() => {
    setView(markdown ? "rendered" : "source");
  }, [path, markdown]);

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
          {markdown && (
            <span className="mr-1 inline-flex overflow-hidden rounded-sm border border-rule" role="tablist" aria-label="Markdown view">
              {(["rendered", "source"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`px-2 py-0.5 text-eyebrow font-semibold uppercase tracking-eyebrow capitalize transition-colors ${
                    view === v ? "bg-ink-600 text-text" : "text-text-muted hover:bg-ink-600 hover:text-text"
                  }`}
                >
                  {v}
                </button>
              ))}
            </span>
          )}
          {actions}
          <IconButton label={copied ? "Copied" : "Copy"} onClick={copy} active={copied} />
          {onDownload && <IconButton label="Download" onClick={onDownload} />}
        </span>
      </div>
      {markdown && view === "rendered" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-ink-800">
          <MarkdownView content={content} />
        </div>
      ) : (
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
      )}
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
