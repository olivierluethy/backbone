/**
 * The architecture layout resolver. Architecture is the second generation axis (see
 * `@backbone/core` capabilities): it decides the *structure* of the generated project — where
 * models, use-cases, controllers and infrastructure live, and which way dependencies point —
 * independently of the framework.
 *
 * A `Layout` is a deterministic, framework-agnostic mapping from a logical "role" (model,
 * service, controller, …) to a directory under the generated boundary, plus documentation
 * metadata describing the layering and its dependency rule. Layout-aware framework presets
 * consult `ctx.layout` when placing files so the same component templates can be re-projected
 * into Layered, Clean, Onion, Monolithic, MVC, MVVM or Microservices structures.
 */

import type { Architecture } from "@backbone/core";

/** The logical building blocks every backend is composed of, regardless of framework. */
export type Role =
  | "model" // persistence entity / ORM model
  | "repository" // data-access abstraction (present in clean/onion)
  | "usecase" // application use-case / interactor (clean/onion)
  | "service" // business logic
  | "controller" // request handler
  | "viewmodel" // response shaping (serializer / resource / DTO)
  | "validator" // input validation
  | "route" // HTTP routing / wiring
  | "middleware" // cross-cutting request middleware
  | "auth" // authentication
  | "config" // configuration
  | "db" // database connection / persistence infra
  | "types" // shared types
  | "shared"; // misc shared/framework glue

/** One documented layer, for the generated ARCHITECTURE / LAYERS reference. */
export interface LayerDoc {
  name: string;
  /** Directory (under the boundary) this layer occupies. */
  path: string;
  /** What lives here and what it may depend on. */
  role: string;
}

export interface Layout {
  architecture: Architecture;
  /** Human title, e.g. "Clean Architecture". */
  title: string;
  /**
   * True when each entity gets its own self-contained module folder (monolithic /
   * microservices). Roles then resolve to a subdirectory *inside* that per-entity module.
   */
  entityModules: boolean;
  /**
   * Directory (relative to the generated boundary) for a role. For entity-module layouts this
   * is the subdirectory inside `<modulesRoot>/<entity>/`.
   */
  dir(role: Role): string;
  /** Root directory holding per-entity modules (entityModules layouts only). */
  modulesRoot: string;
  /** Directory for cross-cutting shared framework code. */
  sharedRoot: string;
  /** One-line dependency rule for docs, e.g. "dependencies point inward". */
  dependencyRule: string;
  /** Ordered layer documentation for the generated ARCHITECTURE reference. */
  layers: LayerDoc[];
}

/**
 * Role → directory maps per architecture. Names are generic so any framework can adopt them.
 * These describe the *default* projection; a framework may override individual roles it does
 * not emit (e.g. no repository layer in a plain layered Express app).
 */
const LAYERED: Record<Role, string> = {
  model: "models",
  repository: "repositories",
  usecase: "services",
  service: "services",
  controller: "controllers",
  viewmodel: "serializers",
  validator: "validators",
  route: "routes",
  middleware: "middleware",
  auth: "auth",
  config: "config",
  db: "config",
  types: ".",
  shared: ".",
};

const CLEAN: Record<Role, string> = {
  model: "domain/entities",
  repository: "domain/repositories",
  usecase: "application/use-cases",
  service: "application/services",
  controller: "interfaces/controllers",
  viewmodel: "interfaces/presenters",
  validator: "interfaces/validators",
  route: "interfaces/routes",
  middleware: "interfaces/middleware",
  auth: "application/auth",
  config: "infrastructure/config",
  db: "infrastructure/persistence",
  types: "domain",
  shared: "infrastructure",
};

const ONION: Record<Role, string> = {
  model: "core/domain/entities",
  repository: "core/domain/repositories",
  usecase: "core/application/use-cases",
  service: "core/application/services",
  controller: "presentation/controllers",
  viewmodel: "presentation/presenters",
  validator: "presentation/validators",
  route: "presentation/routes",
  middleware: "presentation/middleware",
  auth: "core/application/auth",
  config: "infrastructure/config",
  db: "infrastructure/persistence",
  types: "core/domain",
  shared: "infrastructure",
};

const MVC: Record<Role, string> = {
  model: "models",
  repository: "repositories",
  usecase: "services",
  service: "services",
  controller: "controllers",
  viewmodel: "serializers",
  validator: "requests",
  route: "routes",
  middleware: "middleware",
  auth: "auth",
  config: "config",
  db: "config",
  types: ".",
  shared: ".",
};

const MVVM: Record<Role, string> = {
  model: "models",
  repository: "repositories",
  usecase: "services",
  service: "services",
  controller: "controllers",
  viewmodel: "view-models",
  validator: "validators",
  route: "routes",
  middleware: "middleware",
  auth: "auth",
  config: "config",
  db: "config",
  types: ".",
  shared: ".",
};

/** Inside a per-entity module (monolithic / microservices), roles collapse to flat files. */
const MODULE: Record<Role, string> = {
  model: ".",
  repository: ".",
  usecase: ".",
  service: ".",
  controller: ".",
  viewmodel: ".",
  validator: ".",
  route: ".",
  middleware: ".",
  auth: ".",
  config: ".",
  db: ".",
  types: ".",
  shared: ".",
};

function layerDocs(map: Record<Role, string>, kind: Architecture): LayerDoc[] {
  switch (kind) {
    case "clean":
      return [
        { name: "Domain", path: map.model.split("/")[0], role: "Entities and repository interfaces. Depends on nothing." },
        { name: "Application", path: map.usecase.split("/")[0], role: "Use-cases orchestrating the domain. Depends only on Domain." },
        { name: "Interfaces", path: map.controller.split("/")[0], role: "Controllers, routes, validators — the delivery mechanism." },
        { name: "Infrastructure", path: map.db.split("/")[0], role: "DB, config, external IO. The outermost ring." },
      ];
    case "onion":
      return [
        { name: "Core / Domain", path: "core/domain", role: "Entities + repository ports. The innermost ring; depends on nothing." },
        { name: "Core / Application", path: "core/application", role: "Use-cases and application services. Depends only inward on Domain." },
        { name: "Infrastructure", path: "infrastructure", role: "Persistence + config adapters implementing the ports." },
        { name: "Presentation", path: "presentation", role: "Controllers, routes, middleware. The outermost ring." },
      ];
    case "mvc":
      return [
        { name: "Models", path: map.model, role: "Data + persistence." },
        { name: "Controllers", path: map.controller, role: "Handle requests, call services/models, return responses." },
        { name: "Views (serializers)", path: map.viewmodel, role: "Shape the response representation." },
        { name: "Routes", path: map.route, role: "Map URLs to controllers." },
      ];
    case "mvvm":
      return [
        { name: "Models", path: map.model, role: "Data + persistence." },
        { name: "View-Models", path: map.viewmodel, role: "Expose model state shaped for transport; mediate model ↔ view." },
        { name: "Controllers", path: map.controller, role: "Thin request handlers binding to view-models." },
        { name: "Routes", path: map.route, role: "Map URLs to controllers." },
      ];
    case "monolithic":
      return [
        { name: "Feature modules", path: "modules/<entity>", role: "Each entity is a self-contained module (model + service + controller + routes)." },
        { name: "Shared", path: "shared", role: "Cross-cutting framework code shared by all modules." },
      ];
    case "microservices":
      return [
        { name: "Services", path: "services/<entity>", role: "One independently-runnable service per bounded context." },
        { name: "Gateway", path: "gateway", role: "Routes inbound requests to the owning service." },
        { name: "Shared", path: "shared", role: "Contracts + framework code shared across services." },
      ];
    case "layered":
    default:
      return [
        { name: "Routes", path: map.route, role: "HTTP wiring." },
        { name: "Controllers", path: map.controller, role: "Request handling." },
        { name: "Services", path: map.service, role: "Business logic." },
        { name: "Models", path: map.model, role: "Persistence." },
      ];
  }
}

/** Resolve the layout for an architecture. Deterministic and framework-agnostic. */
export function resolveLayout(architecture: Architecture): Layout {
  const entityModules = architecture === "monolithic" || architecture === "microservices";
  const map = entityModules
    ? MODULE
    : architecture === "clean"
      ? CLEAN
      : architecture === "onion"
        ? ONION
        : architecture === "mvc"
          ? MVC
          : architecture === "mvvm"
            ? MVVM
            : LAYERED;

  const titles: Record<Architecture, string> = {
    layered: "Layered",
    clean: "Clean Architecture",
    onion: "Onion Architecture",
    monolithic: "Modular Monolith",
    mvc: "Model-View-Controller",
    mvvm: "Model-View-ViewModel",
    microservices: "Microservices",
  };

  const rules: Record<Architecture, string> = {
    layered: "each layer depends only on the layer directly beneath it",
    clean: "source-code dependencies point inward — outer rings depend on inner, never the reverse",
    onion: "the domain core depends on nothing; all dependencies point inward toward it",
    monolithic: "modules are self-contained and communicate through shared contracts, not internals",
    mvc: "controllers depend on models and views; models never depend on controllers",
    mvvm: "view-models expose model state; views/controllers depend on view-models, not models directly",
    microservices: "services own their data and depend only on shared contracts, never each other's internals",
  };

  return {
    architecture,
    title: titles[architecture],
    entityModules,
    modulesRoot: architecture === "microservices" ? "services" : "modules",
    sharedRoot: "shared",
    dependencyRule: rules[architecture],
    dir: (role: Role) => map[role],
    layers: layerDocs(map, architecture),
  };
}
