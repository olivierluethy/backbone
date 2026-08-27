import { file, literal } from "../render.js";
import { pluralize, singularize, toCamelCase, toPascalCase, toSnakeCase } from "@backbone/core";
import type { BlueprintView, ColumnView, EntityView } from "../helpers.js";
import type { GenContext, GenFile, MigrationFile, Preset } from "../types.js";

const DIR = "php-symfony";
const G = "src/Generated"; // the owned boundary — PSR-4 `App\Generated\`

/**
 * Symfony 7 + Doctrine ORM, MVC architecture. This is an idiomatic, recognizable Symfony
 * scaffold — NOT a full `symfony new` skeleton (no Flex, no security-bundle, no maker). Every
 * piece of generated code lives under `src/Generated/` (owned, namespace `App\Generated\...`);
 * the kernel, front controller, console and YAML config are written once and are yours to edit.
 * Deterministic, no AI: the same Blueprint always yields byte-identical output.
 */
const symfonyMvc: Preset = {
  id: "symfony-mvc",
  runtime: "php",
  framework: "symfony",
  architecture: "mvc",
  templateDir: DIR,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth, sy };

    // --- Project root & framework wiring (write-once, user-owned) ---
    files.push(file("composer.json", DIR, "root/composer.json.ejs", data, "once"));
    files.push(file(".env.example", DIR, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", DIR, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", DIR, "root/README.md.ejs", data, "once"));
    files.push(file("public/index.php", DIR, "public/index.php.ejs", data, "once"));
    files.push(file("bin/console", DIR, "bin/console.ejs", data, "once", true));
    files.push(file("src/Kernel.php", DIR, "src/Kernel.php.ejs", data, "once"));
    files.push(file("config/packages/framework.yaml", DIR, "config/framework.yaml.ejs", data, "once"));
    files.push(file("config/packages/doctrine.yaml", DIR, "config/doctrine.yaml.ejs", data, "once"));
    files.push(file("config/routes.yaml", DIR, "config/routes.yaml.ejs", data, "once"));
    files.push(literal("var/.gitkeep", "", "once"));

    // --- Owned boundary: one Entity + Repository + Controller per Blueprint entity ---
    for (const e of view.entities) {
      const d = { e, view, auth: view.hasAuth, sy };
      files.push(file(`${G}/Entity/${e.className}.php`, DIR, "generated/Entity/entity.php.ejs", d, "owned"));
      files.push(file(`${G}/Repository/${e.className}Repository.php`, DIR, "generated/Repository/repository.php.ejs", d, "owned"));
      files.push(file(`${G}/Controller/${e.className}Controller.php`, DIR, "generated/Controller/controller.php.ejs", d, "owned"));
    }

    // --- Owned boundary: authentication (only when the Blueprint requires it) ---
    if (view.hasAuth) {
      files.push(file(`${G}/Entity/User.php`, DIR, "generated/Entity/User.php.ejs", data, "owned"));
      files.push(file(`${G}/Repository/UserRepository.php`, DIR, "generated/Repository/UserRepository.php.ejs", data, "owned"));
      files.push(file(`${G}/Security/TokenManager.php`, DIR, "generated/Security/TokenManager.php.ejs", data, "owned"));
      files.push(file(`${G}/Controller/AuthController.php`, DIR, "generated/Controller/AuthController.php.ejs", data, "owned"));
    }

    return files;
  },

  /**
   * Symfony/Doctrine owns its own schema tooling, so Backbone emits no SQL migration file.
   * The README documents `php bin/console doctrine:schema:update --force` for local dev and
   * `make:migration` + `doctrine:migrations:migrate` for production.
   */
  migration(): MigrationFile | null {
    return null;
  },
};

export const phpSymfonyPresets: Preset[] = [symfonyMvc];

/* ------------------------------------------------------------------ *
 * Deterministic Symfony/Doctrine code fragments — computed here so the
 * EJS templates stay logic-light. Passed into every render as `sy`.
 * ------------------------------------------------------------------ */

/** A single Doctrine association derived from a Blueprint relation. */
interface ManyToOneAssoc {
  property: string; // PHP property name, e.g. "project"
  pascal: string; // PascalCase of property, for get/set method names
  targetClass: string; // related entity class, e.g. "Project"
  joinColumn: string; // owning FK column (snake_case), e.g. "project_id"
  nullable: boolean;
  fkField: string | null; // the writable field (camel) this FK came from, if any
}

interface CollectionAssoc {
  property: string; // plural PHP property, e.g. "tasks"
  singular: string; // singular form for add/remove params, e.g. "task"
  pascalSingular: string; // PascalCase singular, for addTask/removeTask
  targetClass: string;
  mappedBy: string; // property on the other side that owns the relation
  owning: boolean; // many-to-many only: does this side declare the join table?
  joinTable: string | null;
}

interface Associations {
  manyToOne: ManyToOneAssoc[];
  oneToMany: CollectionAssoc[];
  manyToMany: CollectionAssoc[];
  /** Map of writable FK field (camel) -> its ManyToOne, so the controller hydrates by relation. */
  claimed: Record<string, ManyToOneAssoc>;
}

/** Drop a trailing "Id"/"id" so a FK field like `projectId` yields the property `project`. */
function stripId(field: string): string {
  const camel = toCamelCase(field);
  const trimmed = camel.replace(/[iI]d$/, "");
  return trimmed.length > 0 ? trimmed : camel;
}

export const sy = {
  /** The `Doctrine\DBAL\Types\Types::*` constant for a Blueprint column. */
  doctrineType(c: ColumnView): string {
    switch (c.type) {
      case "int":
        return "Types::INTEGER";
      case "float":
        return "Types::FLOAT";
      case "boolean":
        return "Types::BOOLEAN";
      case "datetime":
        return "Types::DATETIME_IMMUTABLE";
      case "json":
        return "Types::JSON";
      default: // string, uuid, enum (enum has no native SQLite type — stored as text)
        return "Types::STRING";
    }
  },

  /** Nullable PHP property type declaration for a column, e.g. "?int", "?\DateTimeImmutable". */
  propType(c: ColumnView): string {
    switch (c.type) {
      case "int":
        return "?int";
      case "float":
        return "?float";
      case "boolean":
        return "?bool";
      case "datetime":
        return "?\\DateTimeImmutable";
      case "json":
        return "?array";
      default:
        return "?string";
    }
  },

  /** Arguments for the `#[ORM\Column(...)]` attribute of a non-primary-key column. */
  columnArgs(c: ColumnView): string {
    const parts = [`type: ${this.doctrineType(c)}`];
    if (c.type === "uuid") parts.push("length: 36");
    else if (c.type === "string" || c.type === "enum") parts.push("length: 255");
    parts.push(`nullable: ${c.nullable ? "true" : "false"}`);
    return parts.join(", ");
  },

  /** PHP getter method name for a field, e.g. "getTitle". */
  getter(field: string): string {
    return `get${toPascalCase(field)}`;
  },

  /** PHP setter method name for a field, e.g. "setTitle". */
  setter(field: string): string {
    return `set${toPascalCase(field)}`;
  },

  /** A PHP array literal of an enum's members, or `null` for non-enum columns. */
  enumLiteral(c: ColumnView): string {
    if (c.type !== "enum" || !c.enumValues || c.enumValues.length === 0) return "null";
    return `[${c.enumValues.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(", ")}]`;
  },

  /**
   * Resolve a Blueprint entity's relations into Doctrine associations. ManyToOne relations own
   * the real FK column (so the matching scalar column is NOT mapped twice); OneToMany/ManyToMany
   * become collection properties. The result is deterministic for a given Blueprint.
   */
  associations(e: EntityView, view: BlueprintView): Associations {
    const manyToOne: ManyToOneAssoc[] = [];
    const claimed: Record<string, ManyToOneAssoc> = {};

    // 1. Any scalar FK column becomes the owning side of a ManyToOne (it keeps the DB column).
    for (const c of e.columns) {
      if (!c.fkTo) continue;
      const rel = e.manyToOne.find(
        (r) => (r.fk && toSnakeCase(r.fk) === c.name) || r.target === c.fkTo,
      );
      const property = rel?.via ? stripId(rel.via) : toCamelCase(c.fkTo);
      const assoc: ManyToOneAssoc = {
        property,
        pascal: toPascalCase(property),
        targetClass: toPascalCase(c.fkTo),
        joinColumn: c.name,
        nullable: c.nullable,
        fkField: c.field,
      };
      manyToOne.push(assoc);
      claimed[c.field] = assoc;
    }

    // 2. ManyToOne relations without a matching scalar column still get an association.
    for (const r of e.manyToOne) {
      const property = r.via ? stripId(r.via) : toCamelCase(r.target);
      if (manyToOne.some((m) => m.property === property && m.targetClass === toPascalCase(r.target))) {
        continue;
      }
      manyToOne.push({
        property,
        pascal: toPascalCase(property),
        targetClass: toPascalCase(r.target),
        joinColumn: r.fk ? toSnakeCase(r.fk) : `${toSnakeCase(property)}_id`,
        nullable: true,
        fkField: null,
      });
    }

    // 3. OneToMany — inverse side; the FK lives on the target's ManyToOne (named after this entity).
    const oneToMany: CollectionAssoc[] = e.oneToMany.map((r) => {
      const property = pluralize(toCamelCase(r.target));
      const singular = singularize(property);
      return {
        property,
        singular,
        pascalSingular: toPascalCase(singular),
        targetClass: toPascalCase(r.target),
        mappedBy: toCamelCase(e.name),
        owning: false,
        joinTable: null,
      };
    });

    // 4. ManyToMany — the side whose table sorts first owns the join table (matches the view).
    const manyToMany: CollectionAssoc[] = e.manyToMany.map((r) => {
      const property = pluralize(toCamelCase(r.target));
      const singular = singularize(property);
      const jt = r.joinTable ? view.joinTables.find((j) => j.name === r.joinTable) : undefined;
      const owning = jt ? jt.left === e.table : true;
      return {
        property,
        singular,
        pascalSingular: toPascalCase(singular),
        targetClass: toPascalCase(r.target),
        mappedBy: pluralize(toCamelCase(e.name)),
        owning,
        joinTable: r.joinTable ?? null,
      };
    });

    return { manyToOne, oneToMany, manyToMany, claimed };
  },
};
