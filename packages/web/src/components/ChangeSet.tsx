import type { BlueprintDiff, ChangeKind, EntityChange, FieldChange } from "@backbone/core";
import { Eyebrow } from "./primitives";

/**
 * The transparent change set for a regeneration. Leads with an impact summary (added / modified /
 * deleted counts for entities and endpoints) and a marker legend, then groups the concrete changes by
 * kind. Deletions are explicit, modifications show field-level detail, and each change carries a short
 * context clause explaining why it happened where that is derivable from the diff. Computed purely
 * from the blueprint diff, so it is stable and persists with the project.
 */

const KIND_META = {
  added: { glyph: "+", text: "text-verd-400", marker: "text-verd-500", label: "added" },
  changed: { glyph: "~", text: "text-brass-400", marker: "text-brass-500", label: "modified" },
  removed: { glyph: "−", text: "text-danger-500", marker: "text-danger-500", label: "deleted" },
  unchanged: { glyph: "·", text: "text-text-muted", marker: "text-text-muted", label: "unchanged" },
} as const;

interface ChangeItem {
  scope: "entity" | "endpoint";
  kind: Exclude<ChangeKind, "unchanged">;
  name: string;
  context: string;
  fields?: FieldChange[];
}

function entityContext(kind: ChangeKind, migrationNeeded: boolean): string {
  if (kind === "added") return migrationNeeded ? "new table — additive migration appended" : "new entity detected";
  if (kind === "removed") return "no longer in the Blueprint — existing table and migrations preserved";
  return "fields changed";
}

function endpointContext(kind: ChangeKind): string {
  if (kind === "added") return "new frontend call detected";
  if (kind === "removed") return "no longer called by the frontend";
  return "operation signature changed";
}

function collect(diff: BlueprintDiff): ChangeItem[] {
  const items: ChangeItem[] = [];
  for (const e of diff.entities) {
    if (e.kind === "unchanged") continue;
    items.push({
      scope: "entity",
      kind: e.kind,
      name: e.entity,
      context: entityContext(e.kind, diff.migrationNeeded),
      fields: e.kind === "changed" ? e.fieldChanges.filter((f) => f.kind !== "unchanged") : undefined,
    });
  }
  for (const ep of diff.endpoints) {
    if (ep.kind === "unchanged") continue;
    items.push({ scope: "endpoint", kind: ep.kind, name: ep.key, context: endpointContext(ep.kind) });
  }
  return items;
}

function tally(changes: { kind: ChangeKind }[]) {
  return {
    added: changes.filter((c) => c.kind === "added").length,
    changed: changes.filter((c) => c.kind === "changed").length,
    removed: changes.filter((c) => c.kind === "removed").length,
  };
}

export function ChangeSet({ diff }: { diff: BlueprintDiff }) {
  const items = collect(diff);
  if (items.length === 0) return null;

  const entities = tally(diff.entities);
  const endpoints = tally(diff.endpoints);

  const order: Array<ChangeItem["kind"]> = ["added", "changed", "removed"];
  const groups = order
    .map((kind) => ({ kind, list: items.filter((i) => i.kind === kind) }))
    .filter((g) => g.list.length > 0);

  return (
    <div>
      <Eyebrow count={items.length}>Change set</Eyebrow>

      {/* impact summary */}
      <div className="mt-2 rounded-md border border-line bg-surface p-3">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-6">
          <ImpactRow label="Entities" t={entities} />
          <ImpactRow label="Endpoints" t={endpoints} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2 text-mono text-text-muted">
          <LegendMark kind="added" /> <LegendMark kind="changed" /> <LegendMark kind="removed" />
        </div>
      </div>

      {/* grouped changes */}
      <div className="mt-3 space-y-4 rounded-md border border-line bg-ink-800 p-3">
        {groups.map((g) => (
          <div key={g.kind}>
            <div className="eyebrow mb-1.5">
              {KIND_META[g.kind].label} · {g.list.length}
            </div>
            <div className="space-y-1">
              {g.list.map((item) => (
                <Row key={`${item.scope}:${item.name}`} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImpactRow({ label, t }: { label: string; t: { added: number; changed: number; removed: number } }) {
  return (
    <div className="mono flex items-center gap-2 text-mono">
      <span className="text-text-muted">{label}</span>
      <Count n={t.added} kind="added" suffix="added" />
      <span className="text-rule">·</span>
      <Count n={t.changed} kind="changed" suffix="modified" />
      <span className="text-rule">·</span>
      <Count n={t.removed} kind="removed" suffix="deleted" />
    </div>
  );
}

function Count({ n, kind, suffix }: { n: number; kind: keyof typeof KIND_META; suffix: string }) {
  return (
    <span className={n > 0 ? KIND_META[kind].text : "text-text-muted"}>
      {n} {suffix}
    </span>
  );
}

function LegendMark({ kind }: { kind: keyof typeof KIND_META }) {
  const m = KIND_META[kind];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={m.marker}>{m.glyph}</span>
      <span>{m.label}</span>
    </span>
  );
}

function Row({ item }: { item: ChangeItem }) {
  const m = KIND_META[item.kind];
  const deleted = item.kind === "removed";
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={`mono ${m.marker}`} aria-hidden>
        {m.glyph}
      </span>
      <span className="eyebrow text-text-muted">{item.scope}</span>
      <span className={`mono ${m.text} ${deleted ? "line-through" : ""}`}>{item.name}</span>
      {item.fields && item.fields.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          {item.fields.map((f) => (
            <FieldChip key={f.field} change={f} />
          ))}
        </span>
      )}
      <span className="text-small text-text-muted">— {item.context}</span>
    </div>
  );
}

function FieldChip({ change }: { change: FieldChange }) {
  const m = KIND_META[change.kind];
  const type = change.after?.type ?? change.before?.type;
  return (
    <span
      className={`mono inline-flex items-center gap-0.5 rounded-sm border border-rule bg-ink-700 px-1.5 py-0.5 text-mono ${m.text}`}
      title={type ? `${change.field}: ${type}` : change.field}
    >
      <span aria-hidden>{m.glyph}</span>
      {change.field}
    </span>
  );
}
