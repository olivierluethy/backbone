/**
 * JSON Schema (draft-07) for the Blueprint. Provided so external tooling / editors can
 * validate a hand-edited blueprint.json. The authoritative runtime validator is
 * `validateBlueprint` in blueprint.ts; this mirrors its shape.
 */
export const BLUEPRINT_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://backbone.dev/blueprint.schema.json",
  title: "Backbone Blueprint",
  type: "object",
  required: ["version", "meta", "entities", "endpoints", "auth", "datastore", "notes"],
  properties: {
    version: { const: 1 },
    meta: {
      type: "object",
      required: ["frontendPath"],
      properties: {
        frontendPath: { type: "string" },
        generatedAt: { type: "string" },
        analyzer: { type: "string" },
      },
    },
    entities: { type: "array", items: { $ref: "#/definitions/entity" } },
    endpoints: { type: "array", items: { $ref: "#/definitions/endpoint" } },
    auth: {
      type: "object",
      required: ["required", "roles"],
      properties: {
        required: { type: "boolean" },
        roles: { type: "array", items: { type: "string" } },
      },
    },
    datastore: {
      type: "object",
      required: ["required", "dialect"],
      properties: {
        required: { type: "boolean" },
        dialect: { enum: ["sqlite", "mysql"] },
      },
    },
    frontend: {
      type: "object",
      required: ["framework", "displayName", "detected"],
      properties: {
        framework: {
          enum: [
            "react",
            "next",
            "vue",
            "nuxt",
            "angular",
            "svelte",
            "sveltekit",
            "solid",
            "preact",
            "unknown",
          ],
        },
        displayName: { type: "string" },
        version: { type: "string" },
        meta: { type: "string" },
        detected: { type: "boolean" },
        sourceRefs: { type: "array", items: { $ref: "#/definitions/sourceRef" } },
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
  definitions: {
    sourceRef: {
      type: "object",
      required: ["file", "line"],
      properties: {
        file: { type: "string" },
        line: { type: "integer", minimum: 1 },
        note: { type: "string" },
      },
    },
    field: {
      type: "object",
      required: ["name", "type", "nullable", "sourceRefs"],
      properties: {
        name: { type: "string" },
        type: { enum: ["string", "int", "float", "boolean", "datetime", "enum", "uuid", "json"] },
        nullable: { type: "boolean" },
        enumValues: { type: "array", items: { type: "string" } },
        fkTo: { type: "string" },
        primaryKey: { type: "boolean" },
        sourceRefs: { type: "array", items: { $ref: "#/definitions/sourceRef" } },
      },
    },
    relation: {
      type: "object",
      required: ["kind", "target", "sourceRefs"],
      properties: {
        kind: { enum: ["many-to-one", "one-to-many", "many-to-many"] },
        target: { type: "string" },
        fk: { type: "string" },
        joinTable: { type: "string" },
        via: { type: "string" },
        sourceRefs: { type: "array", items: { $ref: "#/definitions/sourceRef" } },
      },
    },
    entity: {
      type: "object",
      required: ["name", "table", "fields", "relations", "generate", "sourceRefs"],
      properties: {
        name: { type: "string" },
        table: { type: "string" },
        fields: { type: "array", items: { $ref: "#/definitions/field" } },
        relations: { type: "array", items: { $ref: "#/definitions/relation" } },
        generate: { type: "boolean" },
        sourceRefs: { type: "array", items: { $ref: "#/definitions/sourceRef" } },
      },
    },
    endpoint: {
      type: "object",
      required: ["method", "path", "operation", "auth", "generate", "sourceRefs"],
      properties: {
        method: { enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string" },
        operation: { enum: ["list", "read", "create", "update", "delete", "custom"] },
        entity: { type: "string" },
        requestType: { type: "string" },
        responseType: { type: "string" },
        auth: {
          type: "object",
          required: ["required"],
          properties: {
            required: { type: "boolean" },
            roles: { type: "array", items: { type: "string" } },
          },
        },
        generate: { type: "boolean" },
        sourceRefs: { type: "array", items: { $ref: "#/definitions/sourceRef" } },
      },
    },
  },
} as const;
