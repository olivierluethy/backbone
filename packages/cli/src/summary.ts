import type { Blueprint } from "@backbone/core";
import { eyebrow, table, ui } from "./ui.js";

/** Print a human, traceable summary of a Blueprint to stdout. */
export function printBlueprintSummary(bp: Blueprint): void {
  const entCount = bp.entities.length;
  const epCount = bp.endpoints.length;

  console.log("");
  console.log(eyebrow(`Blueprint · ${bp.meta.frontendPath}`));
  console.log(
    ui.muted(
      `${entCount} entit${entCount === 1 ? "y" : "ies"} · ${epCount} endpoint${epCount === 1 ? "" : "s"} · ` +
        `auth ${bp.auth.required ? ui.brass("required") : ui.muted("none")} · ` +
        `datastore ${bp.datastore.required ? `${bp.datastore.dialect}` : "none"}`,
    ),
  );

  for (const e of bp.entities) {
    console.log("");
    console.log(`  ${ui.brass("◆")} ${ui.bold(e.name)} ${ui.muted("→ " + e.table)}`);
    const rows = e.fields.map((f) => [
      "    " + f.name,
      ui.muted(f.type + (f.nullable ? "?" : "") + (f.primaryKey ? " ·pk" : "") + (f.fkTo ? ` ·fk→${f.fkTo}` : "")),
    ]);
    console.log(table(rows));
    if (e.relations.length) {
      console.log(ui.muted("    ⇄ " + e.relations.map((r) => `${r.kind} ${r.target}`).join(", ")));
    }
  }

  if (epCount) {
    console.log("");
    console.log(eyebrow("Endpoints"));
    const rows = bp.endpoints.map((ep) => [
      "  " + methodColor(ep.method),
      ep.path,
      ui.muted(ep.operation),
      ui.muted(ep.entity ?? "—"),
      ep.auth.required ? ui.brass("🔒") : ui.muted("·"),
    ]);
    console.log(table(rows));
  }

  if (bp.notes.length) {
    console.log("");
    console.log(eyebrow("Notes"));
    bp.notes.forEach((n) => console.log(ui.muted("  · " + n)));
  }
  console.log("");
}

function methodColor(m: string): string {
  if (m === "GET") return ui.muted(m.padEnd(6));
  if (m === "DELETE") return ui.danger(m.padEnd(6));
  return ui.brass(m.padEnd(6));
}
