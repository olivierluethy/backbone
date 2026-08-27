import type { PrismTheme } from "prism-react-renderer";

/**
 * Syntax palette mapped to the Backbone tokens (styleguide §6.3) — no rainbow. Shared by the code
 * viewer and the fenced code blocks inside rendered Markdown so highlighted code reads identically
 * whether a file is shown as source or a Markdown preview.
 */
export const prismTheme: PrismTheme = {
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
