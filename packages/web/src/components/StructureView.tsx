import { useEffect, useMemo, useState } from "react";
import type { Blueprint } from "@backbone/core";
import { api, type TreeNode } from "../api";
import { renderMermaid, token } from "./mermaid";
import { DiagramCanvas } from "./DiagramCanvas";
import { Button, Eyebrow } from "./primitives";

type Mode = "entities" | "directory";

export function StructureView({
  blueprint,
  dir,
  refreshKey,
}: {
  blueprint: Blueprint;
  dir: string;
  /** Bumped on each regeneration so the directory diagram re-fetches even when dir is unchanged. */
  refreshKey?: string;
}) {
  const [mode, setMode] = useState<Mode>("entities");
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.generatedTree(dir).then(({ tree }) => setTree(tree)).catch(() => setTree([]));
  }, [dir, refreshKey]);

  const source = useMemo(
    () => (mode === "entities" ? entityDiagram(blueprint) : directoryDiagram(tree ?? [])),
    [mode, blueprint, tree],
  );

  useEffect(() => {
    let alive = true;
    renderMermaid(source)
      .then((out) => alive && setSvg(out))
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
      <DiagramCanvas svg={svg} ariaLabel={`Structure diagram — ${mode}`} />
    </div>
  );
}

/** Deterministic, compact ER diagram from the Blueprint (entities + fields + relations). */
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

function esc(s: string): string {
  return s.replace(/"/g, "'");
}

/**
 * Compact directory diagram: folders become nested Mermaid `subgraph`s that visually group their
 * own files, instead of one sprawling left-to-right graph. Generated files carry the verdigris
 * boundary colour. Node labels are just the file/folder name to stay space-efficient.
 */
function directoryDiagram(tree: TreeNode[]): string {
  const gen = token("--verd-400");
  const lines: string[] = ["flowchart TB", `  classDef gen color:${gen},stroke-width:1px;`];
  let id = 0;
  const nextId = () => `n${id++}`;
  const generated: string[] = [];

  const walk = (nodes: TreeNode[]) => {
    // Files first (as leaf nodes), then folders (as subgraphs) — keeps each group tidy.
    const files = nodes.filter((n) => n.type === "file");
    const dirs = nodes.filter((n) => n.type === "dir");
    for (const f of files) {
      const nid = nextId();
      lines.push(`  ${nid}["${esc(f.name)}"]`);
      if (f.generated) generated.push(nid);
    }
    for (const d of dirs) {
      const nid = nextId();
      lines.push(`  subgraph ${nid}["${esc(d.name)}/"]`);
      lines.push("    direction TB");
      if (d.children && d.children.length) walk(d.children);
      lines.push("  end");
    }
  };

  lines.push(`  subgraph root["project/"]`);
  lines.push("    direction TB");
  if (tree.length) walk(tree);
  else lines.push(`    ${nextId()}["(no files yet)"]`);
  lines.push("  end");
  if (generated.length) lines.push(`  class ${generated.join(",")} gen;`);
  return lines.join("\n");
}
