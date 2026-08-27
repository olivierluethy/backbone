/**
 * Deterministic naming helpers. Determinism is the whole point of Backbone, so these are
 * pure and rule-based — no dictionaries beyond a small, fixed irregular set. Equivalent
 * names always yield equivalent tables, routes, and join tables.
 */

const IRREGULAR_PLURALS: Record<string, string> = {
  person: "people",
  child: "children",
  man: "men",
  woman: "women",
  tooth: "teeth",
  foot: "feet",
  mouse: "mice",
  goose: "geese",
  datum: "data",
  index: "indices",
  matrix: "matrices",
  vertex: "vertices",
};

/** Words that are already plural or uncountable — left unchanged. */
const UNCOUNTABLE = new Set([
  "series",
  "species",
  "data",
  "info",
  "equipment",
  "news",
  "fish",
  "sheep",
]);

/** camelCase / PascalCase / kebab / space -> snake_case, deterministically. */
export function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function toPascalCase(input: string): string {
  return input
    .replace(/[_\s-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function toCamelCase(input: string): string {
  const p = toPascalCase(input);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** kebab-case, used for module folder names in the modular preset. */
export function toKebabCase(input: string): string {
  return toSnakeCase(input).replace(/_/g, "-");
}

/** Deterministic English pluralisation covering the common regular rules + a fixed set. */
export function pluralize(word: string): string {
  const lower = word.toLowerCase();
  if (UNCOUNTABLE.has(lower)) return word;
  if (IRREGULAR_PLURALS[lower]) return matchCase(word, IRREGULAR_PLURALS[lower]);

  if (/(s|x|z|ch|sh)$/i.test(word)) return word + "es";
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  if (/(f)$/i.test(word)) return word.slice(0, -1) + "ves";
  if (/fe$/i.test(word)) return word.slice(0, -2) + "ves";
  if (/[^aeiou]o$/i.test(word)) return word + "es";
  return word + "s";
}

export function singularize(word: string): string {
  const lower = word.toLowerCase();
  for (const [sing, plur] of Object.entries(IRREGULAR_PLURALS)) {
    if (plur === lower) return matchCase(word, sing);
  }
  if (UNCOUNTABLE.has(lower)) return word;
  if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
  if (/ves$/i.test(word)) return word.slice(0, -3) + "f";
  if (/(ches|shes|xes|zes|ses)$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** Entity name -> snake_case plural table name, e.g. "TaskItem" -> "task_items". */
export function tableName(entityName: string): string {
  const snake = toSnakeCase(entityName);
  const parts = snake.split("_");
  const last = parts.pop() as string;
  return [...parts, toSnakeCase(pluralize(last))].join("_");
}

/**
 * Deterministic join-table name for a many-to-many: the two snake table names sorted
 * alphabetically and joined with an underscore, e.g. ("tags","posts") -> "posts_tags".
 */
export function joinTableName(tableA: string, tableB: string): string {
  return [tableA, tableB].sort().join("_");
}

/** Copy the leading-capital / all-caps casing of `source` onto `target`. */
function matchCase(source: string, target: string): string {
  if (source === source.toUpperCase()) return target.toUpperCase();
  if (source.charAt(0) === source.charAt(0).toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}
