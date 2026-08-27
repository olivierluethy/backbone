import mermaid from "mermaid";

/**
 * Shared Mermaid setup. Mermaid needs real colour values (not CSS variables), so we read the
 * concrete token values off :root and feed them into the theme — keeping every diagram on the
 * Backbone palette. Initialised once, lazily.
 */

/** Read a design token's concrete value so Mermaid stays on-palette. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

let initialised = false;
export function ensureMermaid(): void {
  if (initialised) return;
  const mono = '"IBM Plex Mono", ui-monospace, monospace';
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    fontFamily: mono,
    themeVariables: {
      background: token("--ink-800"),
      primaryColor: token("--ink-700"),
      primaryBorderColor: token("--rule"),
      primaryTextColor: token("--paper-100"),
      secondaryColor: token("--ink-600"),
      tertiaryColor: token("--ink-800"),
      lineColor: token("--rule"),
      textColor: token("--paper-100"),
      fontSize: "13px",
      attributeBackgroundColorOdd: token("--ink-700"),
      attributeBackgroundColorEven: token("--ink-800"),
    },
  });
  initialised = true;
}

let renderSeq = 0;

/** Render a Mermaid source string to an SVG string, isolated per call. */
export async function renderMermaid(source: string): Promise<string> {
  ensureMermaid();
  const id = `bb-mmd-${renderSeq++}`;
  const { svg } = await mermaid.render(id, source);
  return svg;
}
