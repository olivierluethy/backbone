import { useEffect, useMemo, useState } from "react";
import { tableName, type Blueprint, type Entity, type Relation } from "@backbone/core";
import { renderMermaid } from "./mermaid";
import { Button, Eyebrow } from "./primitives";
import { DiagramCanvas } from "./DiagramCanvas";

/**
 * The dedicated Database view — a relational / ER diagram of the schema Backbone would create,
 * derived deterministically from the Blueprint. Tables show columns with PK/FK markers, and
 * relations are drawn with explicit crow's-foot cardinalities:
 *   1:1  (`||--||`)  · a shared-primary-key one-to-one
 *   1:N  (`||--o{`)  · one-to-many / many-to-one
 *   N:N  (`}o--o{`)  · many-to-many (through a join table)
 * This is separate from, and complements, the Structure (directory / component) diagram.
 */
export function DatabaseView({ blueprint }: { blueprint: Blueprint }) {
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);

  // Only entities the developer kept generate a table.
  const entities = useMemo(() => blueprint.entities.filter((e) => e.generate), [blueprint]);
  const source = useMemo(() => erDiagram(entities, blueprint), [entities, blueprint]);

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

  if (entities.length === 0) {
    return (
      <div className="drafting-grid rounded-md border border-line p-8 text-small text-text-muted">
        No entities selected — nothing to diagram. Enable an entity in the Blueprint.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Eyebrow count={entities.length}>Database schema</Eyebrow>
        <Legend />
        <Button variant="ghost" onClick={copySource} className="ml-auto">
          {copied ? "Copied" : "Copy diagram source"}
        </Button>
      </div>
      <DiagramCanvas svg={svg} ariaLabel="Database schema (ER) diagram" />
    </div>
  );
}

/** Cardinality legend — the three relationship kinds, in mono. */
function Legend() {
  const items: Array<[string, string]> = [
    ["1:1", "one-to-one"],
    ["1:N", "one-to-many"],
    ["N:N", "many-to-many"],
  ];
  return (
    <div className="flex items-center gap-3">
      {items.map(([sym, label]) => (
        <span key={sym} className="inline-flex items-center gap-1.5">
          <span className="mono rounded-sm border border-rule bg-ink-800 px-1.5 py-0.5 text-mono text-brass-400">
            {sym}
          </span>
          <span className="text-small text-text-muted">{label}</span>
        </span>
      ))}
    </div>
  );
}

/** Build a deterministic Mermaid erDiagram with explicit cardinalities. */
function erDiagram(entities: Entity[], bp: Blueprint): string {
  const names = new Set(entities.map((e) => e.name));
  const lines: string[] = ["erDiagram"];
  const seen = new Set<string>();

  // Relationship edges with explicit cardinality.
  for (const e of entities) {
    for (const r of e.relations) {
      if (!names.has(r.target)) continue;
      const kindKey = cardinalityKey(e, r);
      const pair = [e.name, r.target].sort().join("|") + "|" + kindKey;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const label = sanitize(r.via ?? shortKind(r.kind));

      if (r.kind === "many-to-many") {
        lines.push(`  ${e.name} }o--o{ ${r.target} : "${label} (N:N)"`);
      } else if (isOneToOne(e, r)) {
        lines.push(`  ${e.name} ||--|| ${r.target} : "${label} (1:1)"`);
      } else if (r.kind === "one-to-many") {
        lines.push(`  ${e.name} ||--o{ ${r.target} : "${label} (1:N)"`);
      } else {
        // many-to-one: the target owns the "one" side.
        lines.push(`  ${r.target} ||--o{ ${e.name} : "${label} (1:N)"`);
      }
    }
  }

  // Tables with columns, PK/FK markers.
  for (const e of entities) {
    lines.push(`  ${e.name} {`);
    for (const f of e.fields) {
      const key = f.primaryKey ? " PK" : f.fkTo ? " FK" : "";
      lines.push(`    ${f.type} ${sanitize(f.name)}${key} "${sanitize(tableName(e.name))}"`);
    }
    lines.push("  }");
  }
  // Silence unused import in builds that tree-shake bp — bp reserved for future column notes.
  void bp;
  return lines.join("\n");
}

/**
 * A shared-primary-key relation reads as 1:1: the FK field on this side is also its primary key
 * (a common one-to-one modelling of profile/detail tables). Deterministic from the Blueprint.
 */
function isOneToOne(e: Entity, r: Relation): boolean {
  if (r.kind !== "many-to-one" && r.kind !== "one-to-many") return false;
  const fkField = e.fields.find((f) => f.fkTo === r.target || f.name === r.fk || f.name === r.via);
  return !!fkField?.primaryKey;
}

function cardinalityKey(e: Entity, r: Relation): string {
  if (r.kind === "many-to-many") return "NN";
  return isOneToOne(e, r) ? "11" : "1N";
}

function shortKind(kind: string): string {
  return kind === "many-to-many" ? "links" : kind === "one-to-many" ? "has" : "belongs to";
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}
