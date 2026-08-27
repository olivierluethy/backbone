import { Node, type TypeNode, SyntaxKind } from "ts-morph";
import type { PrimitiveType } from "@backbone/core";

/**
 * Deterministic mapping from a TS type annotation to a Blueprint primitive. No inference
 * beyond fixed, documented rules — the same annotation always yields the same primitive.
 */

export interface MappedType {
  type: PrimitiveType;
  nullable: boolean;
  enumValues?: string[];
  /** If the field references another declared type by name (candidate relation). */
  refName?: string;
  /** True if the reference/primitive was an array (`T[]` / `T | null` handled separately). */
  isArray: boolean;
}

/** Field-name hints that make a bare `number` a float rather than an int. Deterministic. */
const FLOAT_HINTS =
  /(price|amount|cost|rate|total|balance|lat|lng|longitude|latitude|weight|height|ratio|percent|percentage|score|avg|average|sum|tax|discount|fee)/i;

/** Field-name hints that make a `string`/`number` field a datetime. */
const DATE_NAME_HINTS = /(_at$|At$|date$|Date$|timestamp$|Timestamp$)/;

/**
 * Map a type node. `fieldName` and the set of known entity/type names refine the result
 * (float-vs-int heuristic, datetime-by-name, and cross-type references).
 */
export function mapTypeNode(
  typeNode: TypeNode | undefined,
  fieldName: string,
  knownTypeNames: Set<string>,
): MappedType {
  if (!typeNode) return { type: "json", nullable: false, isArray: false };

  let nullable = false;
  let node: TypeNode = typeNode;

  // Union types: pull out null/undefined (nullability) and string-literal unions (enums).
  if (Node.isUnionTypeNode(node)) {
    const members = node.getTypeNodes();
    const literals: string[] = [];
    const nonNull: TypeNode[] = [];
    for (const m of members) {
      const t = m.getText();
      if (t === "null" || t === "undefined") {
        nullable = true;
      } else if (Node.isLiteralTypeNode(m)) {
        const lit = m.getLiteral();
        if (Node.isStringLiteral(lit)) literals.push(lit.getLiteralValue());
        else nonNull.push(m);
      } else {
        nonNull.push(m);
      }
    }
    if (literals.length > 0 && nonNull.length === 0) {
      return { type: "enum", nullable, enumValues: literals, isArray: false };
    }
    if (nonNull.length === 1) {
      const inner = mapTypeNode(nonNull[0], fieldName, knownTypeNames);
      return { ...inner, nullable: nullable || inner.nullable };
    }
    // Mixed/unknown union -> json.
    return { type: "json", nullable, isArray: false };
  }

  // Array types: T[] and Array<T>.
  const arrayInfo = unwrapArray(node);
  if (arrayInfo) {
    const inner = mapTypeNode(arrayInfo, fieldName, knownTypeNames);
    if (inner.refName) {
      return { type: "json", nullable, isArray: true, refName: inner.refName };
    }
    // Array of primitives -> stored as json.
    return { type: "json", nullable, isArray: true };
  }

  // Type references (Date, another entity, or an unknown named type).
  if (Node.isTypeReference(node)) {
    const name = node.getTypeName().getText();
    if (name === "Date") return { type: "datetime", nullable, isArray: false };
    if (knownTypeNames.has(name)) {
      return { type: "json", nullable, isArray: false, refName: name };
    }
    // Unknown named type -> json blob.
    return { type: "json", nullable, isArray: false };
  }

  // Keyword primitives.
  switch (node.getKind()) {
    case SyntaxKind.StringKeyword:
      return { type: nameSuggestsDate(fieldName) ? "datetime" : "string", nullable, isArray: false };
    case SyntaxKind.NumberKeyword:
      return { type: FLOAT_HINTS.test(fieldName) ? "float" : "int", nullable, isArray: false };
    case SyntaxKind.BooleanKeyword:
      return { type: "boolean", nullable, isArray: false };
    case SyntaxKind.LiteralType: {
      // A single string literal type used directly.
      const lit = (node as any).getLiteral?.();
      if (lit && Node.isStringLiteral(lit)) {
        return { type: "enum", nullable, enumValues: [lit.getLiteralValue()], isArray: false };
      }
      return { type: "string", nullable, isArray: false };
    }
    default:
      return { type: "json", nullable, isArray: false };
  }
}

function unwrapArray(node: TypeNode): TypeNode | undefined {
  if (Node.isArrayTypeNode(node)) return node.getElementTypeNode();
  if (Node.isTypeReference(node) && node.getTypeName().getText() === "Array") {
    const args = node.getTypeArguments();
    return args[0];
  }
  return undefined;
}

function nameSuggestsDate(fieldName: string): boolean {
  return DATE_NAME_HINTS.test(fieldName);
}
