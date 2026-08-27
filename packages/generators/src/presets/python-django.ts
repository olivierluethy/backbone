import { file, literal } from "../render.js";
import type { ColumnView } from "../helpers.js";
import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

const DIR = "python-django";
const G = "api/generated"; // the owned boundary

/**
 * Python + Django + Django REST Framework, layered. Generated code lives under
 * `api/generated/` (owned); the project scaffold (manage.py, config/*) is written once.
 * camelCase JSON via djangorestframework-camel-case. Deterministic, no AI.
 *
 * Migrations are Django's own: models are generated deterministically and the developer runs
 * `manage.py makemigrations && migrate` (idiomatic). So `migration()` returns null.
 */
export const pythonDjangoPreset: Preset = {
  id: "python-django",
  runtime: "python",
  architecture: "django",
  templateDir: DIR,

  build(ctx: GenContext): GenFile[] {
    const { view } = ctx;
    const files: GenFile[] = [];
    const data = { view, auth: view.hasAuth, dj };

    // --- Project scaffold (write-once) ---
    files.push(file("manage.py", DIR, "root/manage.py.ejs", data, "once", true));
    files.push(file("requirements.txt", DIR, "root/requirements.txt.ejs", data, "once"));
    files.push(file(".env.example", DIR, "root/env.example.ejs", data, "once"));
    files.push(file(".gitignore", DIR, "root/gitignore.ejs", data, "once"));
    files.push(file("README.md", DIR, "root/README.md.ejs", data, "once"));
    files.push(literal("tests/.gitkeep", "", "once"));

    files.push(literal("config/__init__.py", "", "once"));
    files.push(file("config/settings.py", DIR, "config/settings.py.ejs", data, "once"));
    files.push(file("config/urls.py", DIR, "config/urls.py.ejs", data, "once"));
    files.push(file("config/wsgi.py", DIR, "config/wsgi.py.ejs", data, "once"));
    files.push(file("config/asgi.py", DIR, "config/asgi.py.ejs", data, "once"));

    files.push(file("api/__init__.py", DIR, "app/__init__.py.ejs", data, "once"));
    files.push(file("api/apps.py", DIR, "app/apps.py.ejs", data, "once"));
    files.push(file("api/models.py", DIR, "app/models.py.ejs", data, "once"));
    files.push(file("api/urls.py", DIR, "app/urls.py.ejs", data, "once"));
    files.push(literal("api/migrations/__init__.py", "", "once"));

    // --- Owned boundary ---
    files.push(literal(`${G}/__init__.py`, "", "owned"));
    files.push(file(`${G}/models.py`, DIR, "generated/models.py.ejs", data, "owned"));
    files.push(file(`${G}/serializers.py`, DIR, "generated/serializers.py.ejs", data, "owned"));
    files.push(file(`${G}/views.py`, DIR, "generated/views.py.ejs", data, "owned"));
    files.push(file(`${G}/urls.py`, DIR, "generated/urls.py.ejs", data, "owned"));
    files.push(file(`${G}/permissions.py`, DIR, "generated/permissions.py.ejs", data, "owned"));
    if (view.hasAuth) {
      files.push(file(`${G}/auth.py`, DIR, "generated/auth.py.ejs", data, "owned"));
    }

    return files;
  },

  migration(_ctx: GenContext, _plan: MigrationPlan): MigrationFile | null {
    // Django derives migrations from the generated models via `makemigrations`.
    return null;
  },
};

/* Deterministic Django model-field fragments, passed into templates as `dj`. */
export const dj = {
  /** The Django model field name (FK columns drop the trailing `_id`). */
  fieldName(c: ColumnView): string {
    return c.fkTo ? c.name.replace(/_id$/, "") : c.name;
  },

  /** RHS of a Django model field: `models.X(...)`. */
  modelField(c: ColumnView, targetClass?: string): string {
    const nb = c.nullable ? ", null=True, blank=True" : "";
    if (c.fkTo) {
      return `models.ForeignKey("${targetClass ?? c.fkTo}", on_delete=models.CASCADE, db_column="${c.name}", related_name="+"${nb})`;
    }
    switch (c.type) {
      case "int":
        return `models.IntegerField(${c.nullable ? "null=True, blank=True" : ""})`;
      case "float":
        return `models.FloatField(${c.nullable ? "null=True, blank=True" : ""})`;
      case "boolean":
        return `models.BooleanField(${c.nullable ? "null=True, blank=True" : ""})`;
      case "datetime":
        // Server-managed timestamps become auto fields (read-only, set by Django).
        if (c.name === "created_at") return "models.DateTimeField(auto_now_add=True)";
        if (c.name === "updated_at") return "models.DateTimeField(auto_now=True)";
        return `models.DateTimeField(${c.nullable ? "null=True, blank=True" : ""})`;
      case "json":
        return `models.JSONField(${c.nullable ? "null=True, blank=True" : "default=dict"})`;
      case "enum": {
        const choices = (c.enumValues ?? []).map((v) => `(${JSON.stringify(v)}, ${JSON.stringify(v)})`).join(", ");
        return `models.CharField(max_length=64, choices=[${choices}]${nb})`;
      }
      case "uuid":
        return `models.CharField(max_length=36${nb})`;
      default:
        return `models.CharField(max_length=255${nb})`;
    }
  },

  /** The serializer field name exposed in JSON (snake; the camel renderer converts it). */
  serializerField(c: ColumnView): string {
    return c.name;
  },

  /** A DRF serializer field for an auth extra column. */
  drfField(c: ColumnView): string {
    switch (c.type) {
      case "int":
        return "serializers.IntegerField(required=False, allow_null=True)";
      case "float":
        return "serializers.FloatField(required=False, allow_null=True)";
      case "boolean":
        return "serializers.BooleanField(required=False)";
      default:
        return "serializers.CharField(required=False, allow_null=True)";
    }
  },
};
