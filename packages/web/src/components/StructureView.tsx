import { useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import type { Blueprint } from "@backbone/core";
import { api, type TreeNode } from "../api";
import { Button, Eyebrow } from "./primitives";

type Mode = "entities" | "directory";

/** Read a design token's concrete value so Mermaid (which needs real colours) stays on-palette. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

let initialised = false;
function initMermaid() {
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
      // ER diagram specifics
      attributeBackgroundColorOdd: token("--ink-700"),
      attributeBackgroundColorEven: token("--ink-800"),
    },
  });
  initialised = true;
}

export function StructureView({ blueprint, dir }: { blueprint: Blueprint; dir: string }) {
  const [mode, setMode] = useState<Mode>("entities");
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    api.generatedTree(dir).then(({ tree }) => setTree(tree)).catch(() => setTree([]));
  }, [dir]);

  const source = useMemo(
    () => (mode === "entities" ? entityDiagram(blueprint) : directoryDiagram(tree ?? [])),
    [mode, blueprint, tree],
  );

  useEffect(() => {
    if (!initialised) initMermaid();
    let alive = true;
    const id = `bb-mermaid-${idRef.current++}`;
    mermaid
      .render(id, source)
      .then(({ svg }) => alive && setSvg(svg))
      .catch((err) => alive && setSvg(`<pre class="mono text-danger-500">${String(err)}</pre>`));
    return () => {
      alive = false;
    };
  }, [source]);

  function copySource() {
    navigator.clipboard?.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Eyebrow>Structure</Eyebrow>
        <div className="ml-2 inline-flex rounded-md border border-rule p-0.5">
          {(["entities", "directory"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-sm px-3 py-1 text-small font-medium capitalize transition-colors ${
                mode === m ? "bg-ink-600 text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={copySource} className="ml-auto">
          {copied ? "Copied" : "Copy Mermaid source"}
        </Button>
      </div>
      <div
        className="drafting-grid overflow-auto rounded-md border border-line p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

/** Deterministic ER diagram from the Blueprint (entities + fields + relations). */
function entityDiagram(bp: Blueprint): string {
  const lines: string[] = ["erDiagram"];
  const seen = new Set<string>();
  for (const e of bp.entities) {
    for (const r of e.relations) {
      const pair = [e.name, r.target].sort().join("|") + "|" + r.kind;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const label = (r.via ?? r.kind).replace(/[^a-zA-Z0-9_]/g, "");
      if (r.kind === "one-to-many") lines.push(`  ${e.name} ||--o{ ${r.target} : "${label}"`);
      else if (r.kind === "many-to-one") lines.push(`  ${r.target} ||--o{ ${e.name} : "${label}"`);
      else lines.push(`  ${e.name} }o--o{ ${r.target} : "${label}"`);
    }
  }
  for (const e of bp.entities) {
    lines.push(`  ${e.name} {`);
    for (const f of e.fields) {
      const keys = f.primaryKey ? " PK" : f.fkTo ? " FK" : "";
      lines.push(`    ${f.type} ${f.name}${keys}`);
    }
    lines.push("  }");
  }
  return lines.join("\n");
}

/** Deterministic directory flowchart from the generated file tree. */
function directoryDiagram(tree: TreeNode[]): string {
  const lines: string[] = ["graph LR", "  classDef gen fill:transparent,stroke-dasharray:0;"];
  let id = 0;
  const nodeId = () => `n${id++}`;
  const walk = (nodes: TreeNode[], parent: string | null) => {
    for (const n of nodes) {
      const nid = nodeId();
      if (n.type === "dir") {
        lines.push(`  ${nid}[["${n.name}/"]]`);
      } else {
        lines.push(`  ${nid}["${n.name}"]`);
      }
      if (parent) lines.push(`  ${parent} --> ${nid}`);
      if (n.children) walk(n.children, nid);
    }
  };
  const rootId = nodeId();
  lines.push(`  ${rootId}[["project/"]]`);
  walk(tree, rootId);
  return lines.join("\n");
}
