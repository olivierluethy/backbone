import {
  Node,
  type SourceFile,
  type InterfaceDeclaration,
  type TypeAliasDeclaration,
  type PropertySignature,
  type Project,
} from "ts-morph";
import type { SourceRef, EntityField } from "@backbone/core";
import { mapTypeNode, type MappedType } from "./typemap.js";
import { isEntityDir, leadingComments, sourceRef } from "./project.js";

/** A declared interface/type alias that could become an entity. */
export interface DeclInfo {
  name: string;
  decl: InterfaceDeclaration | TypeAliasDeclaration;
  isEntityDir: boolean;
  hasEntityTag: boolean;
  sourceRefs: SourceRef[];
}

/** A property read off a declaration, with its deterministic type mapping. */
export interface RawProp {
  name: string;
  optional: boolean;
  mapped: MappedType;
  sourceRefs: SourceRef[];
}

export interface EntityDraft {
  name: string;
  sourceRefs: SourceRef[];
  props: RawProp[];
}

/** Collect every exported interface / type alias in the project as an entity candidate. */
export function collectDeclarations(project: Project, root: string): Map<string, DeclInfo> {
  const out = new Map<string, DeclInfo>();
  for (const sf of project.getSourceFiles()) {
    for (const decl of sf.getInterfaces()) {
      if (!decl.isExported()) continue;
      register(out, decl.getName(), decl, sf, root);
    }
    for (const decl of sf.getTypeAliases()) {
      if (!decl.isExported()) continue;
      // Only object-shaped aliases (type literal / intersection) are entity candidates.
      if (!aliasHasObjectShape(decl)) continue;
      register(out, decl.getName(), decl, sf, root);
    }
  }
  return out;
}

function register(
  out: Map<string, DeclInfo>,
  name: string,
  decl: InterfaceDeclaration | TypeAliasDeclaration,
  sf: SourceFile,
  root: string,
): void {
  if (out.has(name)) return; // first declaration wins, deterministically by file order
  const comment = leadingComments(decl) + "\n" + (decl.getJsDocs?.().map((d) => d.getInnerText()).join("\n") ?? "");
  out.set(name, {
    name,
    decl,
    isEntityDir: isEntityDir(sf, root),
    hasEntityTag: /@entity\b/.test(comment),
    sourceRefs: [sourceRef(decl, root, `${decl.getKindName()} ${name}`)],
  });
}

function aliasHasObjectShape(decl: TypeAliasDeclaration): boolean {
  const t = decl.getTypeNode();
  if (!t) return false;
  if (Node.isTypeLiteral(t)) return true;
  if (Node.isIntersectionTypeNode(t)) return t.getTypeNodes().some((n) => Node.isTypeLiteral(n));
  return false;
}

/** Pull the property signatures off an interface or object-shaped type alias. */
function declProperties(decl: InterfaceDeclaration | TypeAliasDeclaration): PropertySignature[] {
  if (Node.isInterfaceDeclaration(decl)) return decl.getProperties();
  const t = decl.getTypeNode();
  if (t && Node.isTypeLiteral(t)) return t.getProperties();
  if (t && Node.isIntersectionTypeNode(t)) {
    return t.getTypeNodes().flatMap((n) => (Node.isTypeLiteral(n) ? n.getProperties() : []));
  }
  return [];
}

/**
 * Build an EntityDraft (name + raw mapped props) from a declaration. Relations and FK
 * resolution happen later, once the full entity set is known.
 */
export function draftEntity(info: DeclInfo, knownTypeNames: Set<string>, root: string): EntityDraft {
  const props: RawProp[] = [];
  for (const p of declProperties(info.decl)) {
    const name = p.getName();
    const optional = p.hasQuestionToken();
    const mapped = mapTypeNode(p.getTypeNode(), name, knownTypeNames);
    props.push({
      name,
      optional,
      mapped: { ...mapped, nullable: mapped.nullable || optional },
      sourceRefs: [sourceRef(p, root, `${info.name}.${name}`)],
    });
  }
  return { name: info.name, sourceRefs: info.sourceRefs, props };
}

/** Detect a primary-key field from raw props, or signal that one must be synthesised. */
export function primaryKeyField(props: RawProp[]): EntityField | null {
  const idProp = props.find((p) => p.name === "id" || p.name === "uuid" || p.name === "_id");
  if (!idProp) return null;
  const type = idProp.mapped.type === "int" || idProp.mapped.type === "float" ? "int" : "uuid";
  return {
    name: idProp.name === "_id" ? "id" : idProp.name,
    type: type === "int" ? "int" : "uuid",
    nullable: false,
    primaryKey: true,
    sourceRefs: idProp.sourceRefs,
  };
}
