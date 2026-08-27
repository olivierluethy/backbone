import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Highlight } from "prism-react-renderer";
import { prismTheme } from "./prismTheme";
import { ensurePrismLanguages } from "./prism-setup";

/**
 * Rendered Markdown for the file viewer (styleguide §9.3). GFM (tables, task lists, strikethrough)
 * via `remark-gfm`, sanitised with `rehype-sanitize`, styled through the `.markdown-body` prose
 * class. Fenced code blocks are highlighted with the exact §6.3 Prism theme so code reads the same
 * whether the file is shown rendered or as source. This is a viewer only — links open in a new tab.
 */
export function MarkdownView({ content }: { content: string }) {
  const [langsReady, setLangsReady] = useState(false);

  // Load the extra Prism grammars (php/python/sql/…) once so fenced blocks highlight fully.
  useEffect(() => {
    let alive = true;
    ensurePrismLanguages().then(() => alive && setLangsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="markdown-body px-5 py-4">
      <ReactMarkdown
        key={langsReady ? "hl" : "plain"}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          code: ({ className, children }) => <CodeBit className={className}>{children}</CodeBit>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * A fenced code block (has a `language-*` class) is highlighted; inline code renders as a plain
 * styled `<code>`. Highlight renders lines into a `<code>` (not its own `<pre>`) so the block box
 * comes from the surrounding `.markdown-body pre`, avoiding a nested `<pre>`.
 */
function CodeBit({ className, children }: { className?: string; children?: ReactNode }): ReactNode {
  const match = /language-(\w+)/.exec(className ?? "");
  if (!match) return <code className={className}>{children}</code>;
  const code = String(children).replace(/\n$/, "");
  return (
    <Highlight theme={prismTheme} code={code} language={match[1]}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <code className="mono block">
          {tokens.map((line, i) => (
            <span key={i} {...getLineProps({ line })} className="block">
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </span>
          ))}
        </code>
      )}
    </Highlight>
  );
}
