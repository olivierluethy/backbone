import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Blueprint, Entity } from "@backbone/core";
import { Chip, Eyebrow, Toggle } from "./primitives";
import { SourceRef } from "./SourceRef";

interface Edge {
  a: string;
  b: string;
  aCard: string; // cardinality glyph near a
  bCard: string;
  join?: string;
}

/** Deduplicate relations into undirected edges carrying a cardinality glyph per endpoint. */
function buildEdges(entities: Entity[]): Edge[] {
  const names = new Set(entities.map((e) => e.name));
  const map = new Map<string, Edge>();
  for (const e of entities) {
    for (const r of e.relations) {
      if (!names.has(r.target)) continue;
      const key = [e.name, r.target].sort().join("|");
      if (map.has(key)) continue;
      if (r.kind === "many-to-many") {
        map.set(key, { a: e.name, b: r.target, aCard: "∞", bCard: "∞", join: r.joinTable });
      } else if (r.kind === "many-to-one") {
        map.set(key, { a: e.name, b: r.target, aCard: "∞", bCard: "1" });
      } else {
        map.set(key, { a: e.name, b: r.target, aCard: "1", bCard: "∞" });
      }
    }
  }
  return [...map.values()];
}

interface Box {
  cx: number;
  cy: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function BlueprintCanvas({
  blueprint,
  root,
  excluded,
  onToggleEntity,
  onToggleField,
}: {
  blueprint: Blueprint;
  root: string;
  excluded: Set<string>;
  onToggleEntity: (name: string, on: boolean) => void;
  onToggleField: (key: string, on: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const next = new Map<string, Box>();
    for (const [name, el] of cardRefs.current) {
      const r = el.getBoundingClientRect();
      next.set(name, {
        left: r.left - base.left,
        right: r.right - base.left,
        top: r.top - base.top + container.scrollTop,
        bottom: r.bottom - base.top + container.scrollTop,
        cx: (r.left + r.right) / 2 - base.left,
        cy: (r.top + r.bottom) / 2 - base.top + container.scrollTop,
      });
    }
    setBoxes(next);
    setSize({ w: container.scrollWidth, h: container.scrollHeight });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    for (const el of cardRefs.current.values()) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, blueprint]);

  const edges = buildEdges(blueprint.entities);

  return (
    <div className="relative">
      <Eyebrow count={blueprint.entities.length}>Entities</Eyebrow>
      <p className="mt-1 mb-4 text-small text-text-muted">
        Detected from the frontend. Toggle an entity or field to include or exclude it from the
        generated backend. Lines show relations; <span className="mono">1</span> and{" "}
        <span className="mono">∞</span> mark cardinality.
      </p>
      <div
        ref={containerRef}
        onScroll={measure}
        className="drafting-grid relative max-h-[70vh] overflow-auto rounded-md border border-line p-6"
      >
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={size.w}
          height={size.h}
          style={{ zIndex: 0 }}
        >
          {edges.map((edge, i) => (
            <Connector key={i} edge={edge} boxes={boxes} />
          ))}
        </svg>
        <div className="relative flex flex-wrap gap-6" style={{ zIndex: 1 }}>
          {blueprint.entities.map((e) => (
            <EntityCard
              key={e.name}
              entity={e}
              root={root}
              excluded={excluded}
              onToggleEntity={onToggleEntity}
              onToggleField={onToggleField}
              register={(el) => {
                if (el) cardRefs.current.set(e.name, el);
                else cardRefs.current.delete(e.name);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Orthogonal connector between two card boxes, with cardinality glyphs at each end. */
function Connector({ edge, boxes }: { edge: Edge; boxes: Map<string, Box> }) {
  const a = boxes.get(edge.a);
  const b = boxes.get(edge.b);
  if (!a || !b) return null;

  const leftBox = a.cx <= b.cx ? a : b;
  const rightBox = a.cx <= b.cx ? b : a;
  const leftGlyph = a.cx <= b.cx ? edge.aCard : edge.bCard;
  const rightGlyph = a.cx <= b.cx ? edge.bCard : edge.aCard;

  const x1 = leftBox.right;
  const y1 = leftBox.cy;
  const x2 = rightBox.left;
  const y2 = rightBox.cy;
  const midX = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;

  return (
    <g>
      <path d={path} fill="none" stroke="var(--rule)" strokeWidth={1.5} />
      {edge.join && (
        <>
          <rect x={midX - 5} y={(y1 + y2) / 2 - 5} width={10} height={10} fill="var(--ink-600)" stroke="var(--rule)" />
        </>
      )}
      <Glyph x={x1} y={y1} text={leftGlyph} anchor="start" />
      <Glyph x={x2} y={y2} text={rightGlyph} anchor="end" />
    </g>
  );
}

function Glyph({ x, y, text, anchor }: { x: number; y: number; text: string; anchor: "start" | "end" }) {
  const dx = anchor === "start" ? 6 : -6;
  return (
    <text
      x={x + dx}
      y={y - 5}
      fill="var(--brass-400)"
      fontSize={12}
      fontFamily="var(--font-mono)"
      textAnchor={anchor}
    >
      {text}
    </text>
  );
}

function EntityCard({
  entity,
  root,
  excluded,
  onToggleEntity,
  onToggleField,
  register,
}: {
  entity: Entity;
  root: string;
  excluded: Set<string>;
  onToggleEntity: (name: string, on: boolean) => void;
  onToggleField: (key: string, on: boolean) => void;
  register: (el: HTMLDivElement | null) => void;
}) {
  const off = !entity.generate;
  const ref = entity.sourceRefs[0];
  return (
    <div
      ref={register}
      className={`relative w-[300px] rounded-md border border-rule bg-surface transition-opacity ${
        off ? "opacity-50" : ""
      }`}
    >
      {/* brass top edge marks a detected entity */}
      <div className="absolute left-0 right-0 top-0 h-0.5 bg-detected" />
      {/* corner registration ticks */}
      <Ticks />
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 pb-2 pt-3">
        <div className="min-w-0">
          <div className={`mono truncate text-h3 font-medium text-text ${off ? "line-through" : ""}`}>
            {entity.name} <span className="text-text-muted">→ {entity.table}</span>
          </div>
        </div>
        <Toggle on={entity.generate} onChange={(v) => onToggleEntity(entity.name, v)} title="Include in generation" />
      </div>
      <div className="px-2 py-1">
        {entity.fields.map((f) => {
          const key = `${entity.name}.${f.name}`;
          const fieldOff = excluded.has(key);
          return (
            <div
              key={f.name}
              className={`flex items-center gap-2 rounded px-2 py-1 hover:bg-ink-700 ${
                fieldOff ? "opacity-40" : ""
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-pill ${
                  f.nullable ? "bg-ink-400" : "bg-verd-500"
                }`}
                title={f.nullable ? "nullable" : "required"}
              />
              <span className={`flex-1 text-small ${fieldOff ? "line-through" : ""}`}>{f.name}</span>
              <span className="mono text-text-muted">{f.type}</span>
              {f.primaryKey && <Chip tone="brass">pk</Chip>}
              {f.fkTo && <Chip tone="brass">fk→{f.fkTo}</Chip>}
              {!f.primaryKey && (
                <Toggle
                  on={!fieldOff}
                  onChange={(v) => onToggleField(key, v)}
                  title="Include field"
                />
              )}
            </div>
          );
        })}
      </div>
      {entity.fields.some((f) => f.enumValues) && (
        <div className="flex flex-wrap gap-1 border-t border-line px-3 py-2">
          {entity.fields
            .filter((f) => f.enumValues)
            .flatMap((f) => f.enumValues!.map((v) => <Chip key={f.name + v}>{v}</Chip>))}
        </div>
      )}
      {ref && (
        <div className="border-t border-line px-3 py-1.5">
          <SourceRef root={root} file={ref.file} line={ref.line} />
        </div>
      )}
    </div>
  );
}

function Ticks() {
  const c = "absolute h-2 w-2 border-rule";
  return (
    <>
      <span className={`${c} left-1 top-1 border-l border-t`} />
      <span className={`${c} right-1 top-1 border-r border-t`} />
      <span className={`${c} bottom-1 left-1 border-b border-l`} />
      <span className={`${c} bottom-1 right-1 border-b border-r`} />
    </>
  );
}
