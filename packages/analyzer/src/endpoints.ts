import {
  Node,
  type Project,
  type CallExpression,
  type Expression,
} from "ts-morph";
import type { CrudOperation, HttpMethod, PrimitiveType, SourceRef } from "@backbone/core";
import { sourceRef } from "./project.js";

/** A property observed on an object-literal request body, for entity inference. */
export interface BodyField {
  name: string;
  type: PrimitiveType;
}

/** A detected HTTP call, before entity association. */
export interface RawEndpoint {
  method: HttpMethod;
  path: string;
  operation: CrudOperation;
  hasTrailingParam: boolean;
  requestType?: string;
  responseType?: string;
  /** Property names read off an object-literal request body (used to infer entity fields). */
  bodyFields?: BodyField[];
  /** The Authorization/bearer/token was present on this call. */
  authProtected: boolean;
  /** This is a login/register/auth call (drives auth.required, not a CRUD endpoint). */
  isAuthRoute: boolean;
  authKind?: "login" | "register" | "other";
  sourceRefs: SourceRef[];
}

const METHOD_NAMES = new Set(["get", "post", "put", "patch", "delete"]);
const BASE_HINT = /^(api|base|baseurl|api_?url|host|url|endpoint|server|root)/i;
const AUTH_PATH =
  /(login|register|sign-?in|sign-?up|\/auth\b|\/token\b|logout|forgot-?password|reset-?password|change-?password|verify-?email|refresh-?token|oauth)/i;

/**
 * Receiver names that own a `.get/.post/...` method but are NOT HTTP clients — URLSearchParams,
 * Maps, storage, headers, caches, etc. Calls on these are never HTTP endpoints. This matters for
 * JavaScript frontends where `params.get("id")` would otherwise look like `GET /id`.
 */
const NON_HTTP_RECEIVERS =
  /^(params|searchparams|urlsearchparams|query|map|set|weakmap|weakset|cache|headers|storage|localstorage|sessionstorage|cookies?|store|formdata|els|refs|el|node|map_|dict|registry|state|ctx|context)$/i;

/** Receiver names that clearly ARE an HTTP client, so a relative URL string is trusted. */
const HTTP_CLIENT =
  /^(axios|api|apiclient|http|https|client|request|req|\$http|httpclient|instance|service|fetcher|agent|xhr|rest|backend|gateway|conn)$/i;

/** Walk every call expression and extract the HTTP calls we understand. */
export function collectEndpoints(project: Project, root: string): RawEndpoint[] {
  const found: RawEndpoint[] = [];
  for (const sf of project.getSourceFiles()) {
    sf.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const ep = interpretCall(node, root);
        if (ep) found.push(ep);
      }
    });
  }
  return dedupe(found);
}

function interpretCall(call: CallExpression, root: string): RawEndpoint | null {
  const expr = call.getExpression();
  const args = call.getArguments();

  let method: HttpMethod | null = null;
  let urlNode: Node | undefined;
  let optionsNode: Node | undefined;
  let bodyNode: Node | undefined;

  if (Node.isIdentifier(expr) && expr.getText() === "fetch") {
    // fetch(url, options)
    urlNode = args[0];
    optionsNode = args[1];
    method = readFetchMethod(optionsNode) ?? "GET";
    bodyNode = optionsNode;
  } else if (Node.isPropertyAccessExpression(expr)) {
    const prop = expr.getName().toLowerCase();
    if (!METHOD_NAMES.has(prop)) return null;
    // <client>.get/post/... — axios, a typed api client, this.http, etc. But `.get`/`.post` are
    // also owned by URLSearchParams, Map, storage… so we require the receiver to look like an HTTP
    // client OR the URL argument to look like a real path. Otherwise it's not an endpoint.
    const receiver = lastName(expr.getExpression());
    if (receiver && NON_HTTP_RECEIVERS.test(receiver)) return null;
    const urlArg = args[0];
    if (!urlArg) return null;
    const isClient = !!receiver && HTTP_CLIENT.test(receiver);
    if (!isClient && !urlLooksLikePath(urlArg)) return null;
    method = prop.toUpperCase() as HttpMethod;
    urlNode = urlArg;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      bodyNode = args[1];
      optionsNode = args[2];
    } else {
      optionsNode = args[1];
    }
  } else if (Node.isIdentifier(expr) && expr.getText() === "axios") {
    // axios({ method, url })
    const cfg = args[0];
    if (cfg && Node.isObjectLiteralExpression(cfg)) {
      method = (readObjectStringProp(cfg, "method")?.toUpperCase() as HttpMethod) ?? "GET";
      const u = cfg.getProperty("url");
      if (u && Node.isPropertyAssignment(u)) urlNode = u.getInitializer();
      optionsNode = cfg;
      bodyNode = cfg;
    }
  }

  if (!method || !urlNode) return null;
  const raw = parseUrl(urlNode);
  if (raw === null) return null;
  const { path, hasTrailingParam } = normalizePath(raw);
  if (!path || path === "/") return null;
  // Reject fully-dynamic paths (e.g. a generic client wrapper's `${base}${path}`): a real
  // resource route needs at least one static segment.
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0 || segs.every((s) => s.startsWith(":"))) return null;

  const isAuth = AUTH_PATH.test(path);
  const operation = crudFor(method, hasTrailingParam);
  const typeArgs = call.getTypeArguments();
  const responseType = typeArgs[0] ? cleanTypeName(typeArgs[0].getText()) : undefined;

  return {
    method,
    path,
    operation,
    hasTrailingParam,
    responseType,
    requestType: inferRequestType(bodyNode),
    bodyFields: extractBodyFields(bodyNode),
    authProtected: hasAuthToken(optionsNode) || hasAuthToken(bodyNode),
    isAuthRoute: isAuth,
    authKind: isAuth ? authKind(path) : undefined,
    sourceRefs: [sourceRef(call, root, `${method} ${path}`)],
  };
}

/**
 * Does this URL argument look like an HTTP path? Accepts an absolute URL, a leading-slash path, or
 * a template literal that begins with a base-url variable (`${API}/…`) or a slash. Rejects bare
 * strings like `"username"` (which come from non-HTTP `.get()` calls).
 */
function urlLooksLikePath(node: Node): boolean {
  const raw = parseUrl(node);
  if (raw === null) return false;
  if (/^https?:\/\//i.test(raw)) return true;
  if (raw.startsWith("/")) return true;
  // A template whose first interpolation is a base-url variable resolves to a leading-slash path.
  if (Node.isTemplateExpression(node)) {
    const head = node.getHead().getLiteralText();
    if (head.startsWith("/")) return true;
    const first = node.getTemplateSpans()[0]?.getExpression();
    const name = first ? lastName(first) : null;
    if (head.trim() === "" && name && BASE_HINT.test(name)) return true;
  }
  return false;
}

/** Read property names + rough types off an object-literal request body, for entity inference. */
function extractBodyFields(bodyNode: Node | undefined): BodyField[] | undefined {
  if (!bodyNode || !Node.isObjectLiteralExpression(bodyNode)) return undefined;
  const fields: BodyField[] = [];
  for (const prop of bodyNode.getProperties()) {
    let name: string | undefined;
    let type: PrimitiveType = "string";
    if (Node.isPropertyAssignment(prop)) {
      name = prop.getName();
      type = literalType(prop.getInitializer());
    } else if (Node.isShorthandPropertyAssignment(prop)) {
      name = prop.getName();
    }
    // Skip auth/managed fields and spreads; keep simple identifiers only.
    if (!name || /^(headers?|token|authorization|method|url|params|signal|body)$/i.test(name)) continue;
    if (!fields.some((f) => f.name === name)) fields.push({ name, type });
  }
  return fields.length ? fields : undefined;
}

/** Deterministic primitive from a literal initializer, defaulting to string. */
function literalType(init: Node | undefined): PrimitiveType {
  if (!init) return "string";
  if (Node.isNumericLiteral(init)) return init.getText().includes(".") ? "float" : "int";
  if (Node.isTrueLiteral(init) || Node.isFalseLiteral(init)) return "boolean";
  if (Node.isObjectLiteralExpression(init) || Node.isArrayLiteralExpression(init)) return "json";
  return "string";
}

function readFetchMethod(options: Node | undefined): HttpMethod | null {
  if (!options || !Node.isObjectLiteralExpression(options)) return null;
  const m = readObjectStringProp(options, "method");
  return m ? (m.toUpperCase() as HttpMethod) : null;
}

function readObjectStringProp(obj: Node, name: string): string | null {
  if (!Node.isObjectLiteralExpression(obj)) return null;
  const p = obj.getProperty(name);
  if (p && Node.isPropertyAssignment(p)) {
    const init = p.getInitializer();
    if (init && Node.isStringLiteral(init)) return init.getLiteralValue();
    if (init && Node.isNoSubstitutionTemplateLiteral(init)) return init.getLiteralValue();
  }
  return null;
}

/** Assemble a URL string from a string/template literal, or null if unresolvable. */
function parseUrl(node: Node): string | null {
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  if (Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
  if (Node.isTemplateExpression(node)) {
    let out = node.getHead().getLiteralText();
    const spans = node.getTemplateSpans();
    spans.forEach((span, i) => {
      const e = span.getExpression();
      const isFirst = i === 0 && out.trim() === "";
      out += placeholderFor(e, isFirst);
      out += span.getLiteral().getLiteralText();
    });
    return out;
  }
  return null;
}

function placeholderFor(e: Expression, isFirst: boolean): string {
  const name = lastName(e);
  if (isFirst && name && BASE_HINT.test(name)) return ""; // drop leading base-url variable
  if (name) return `:${name}`;
  return ":param";
}

function lastName(e: Expression): string | null {
  if (Node.isIdentifier(e)) return e.getText();
  if (Node.isPropertyAccessExpression(e)) return e.getName();
  return null;
}

/** Strip host/protocol/query, normalise slashes, detect a trailing :param. */
function normalizePath(raw: string): { path: string; hasTrailingParam: boolean } {
  let p = raw.replace(/^[a-z]+:\/\/[^/]+/i, ""); // drop protocol + host
  p = p.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  const segments = p.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  return { path: p, hasTrailingParam: last.startsWith(":") };
}

function crudFor(method: HttpMethod, trailingParam: boolean): CrudOperation {
  switch (method) {
    case "GET":
      return trailingParam ? "read" : "list";
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
  }
}

function inferRequestType(bodyNode: Node | undefined): string | undefined {
  if (!bodyNode) return undefined;
  // axios: the data argument is often a typed identifier; read its declared type if simple.
  if (Node.isIdentifier(bodyNode)) {
    const t = safeTypeText(bodyNode);
    if (t) return cleanTypeName(t);
  }
  return undefined;
}

function safeTypeText(node: Node): string | undefined {
  try {
    const t = node.getType().getText();
    if (!t || t.includes("{") || t.includes("(") || t === "any") return undefined;
    return t;
  } catch {
    return undefined;
  }
}

function cleanTypeName(text: string): string | undefined {
  const base = text.replace(/\[\]$/, "").replace(/^Array<(.+)>$/, "$1").trim();
  if (/^[A-Z][A-Za-z0-9_]*$/.test(base)) return base;
  return undefined;
}

function hasAuthToken(node: Node | undefined): boolean {
  if (!node) return false;
  return /authorization|bearer|\btoken\b|getToken|accessToken/i.test(node.getText());
}

function authKind(path: string): "login" | "register" | "other" {
  if (/register|sign-?up/i.test(path)) return "register";
  if (/login|sign-?in/i.test(path)) return "login";
  return "other";
}

/** Collapse duplicate (method, path) calls, merging source refs and flags. */
function dedupe(eps: RawEndpoint[]): RawEndpoint[] {
  const map = new Map<string, RawEndpoint>();
  for (const ep of eps) {
    const key = `${ep.method} ${ep.path}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, ep);
    } else {
      existing.sourceRefs.push(...ep.sourceRefs);
      existing.authProtected = existing.authProtected || ep.authProtected;
      existing.responseType = existing.responseType ?? ep.responseType;
      existing.requestType = existing.requestType ?? ep.requestType;
      // Union body fields observed across duplicate calls to the same endpoint.
      if (ep.bodyFields) {
        const merged = existing.bodyFields ?? [];
        for (const f of ep.bodyFields) if (!merged.some((x) => x.name === f.name)) merged.push(f);
        existing.bodyFields = merged;
      }
    }
  }
  return [...map.values()];
}
