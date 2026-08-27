/**
 * The capability matrix — the single, shared source of truth for which backend framework
 * belongs to which runtime, and which architectural patterns each framework can idiomatically
 * emit. The CLI and the web UI both consume this so there is exactly one place that decides
 * what combinations are valid. Everything here is plain, deterministic data.
 *
 * Two orthogonal axes:
 *   Runtime  →  Framework  →  Architecture[]
 *
 * Guarantees encoded below (see the project brief):
 *   - Every framework supports its idiomatic default plus `layered` and `clean`.
 *   - Laravel / Symfony / NestJS / Django additionally support `mvc`.
 *   - Express / Fastify / FastAPI / Flask support `layered` / `clean` / `onion` / `monolithic`.
 *   - `microservices` is offered only where a framework can plausibly emit a multi-service
 *     layout (NestJS and FastAPI); elsewhere it is disabled with an explanatory reason.
 *   - `mvvm` is offered on frameworks that carry a real view-model/resource layer
 *     (NestJS, Laravel, Symfony); elsewhere disabled.
 */

import type { Architecture, Framework, Runtime } from "./types.js";

/** Every runtime, in display order. */
export const RUNTIMES: Runtime[] = ["node", "php", "python"];

/** Frameworks available under each runtime, in display order (idiomatic default first). */
export const FRAMEWORKS_BY_RUNTIME: Record<Runtime, Framework[]> = {
  node: ["express", "nestjs", "fastify"],
  php: ["laravel", "symfony", "php-plain"],
  python: ["django", "fastapi", "flask"],
};

/** The runtime a framework belongs to (inverse of {@link FRAMEWORKS_BY_RUNTIME}). */
export const RUNTIME_OF_FRAMEWORK: Record<Framework, Runtime> = {
  express: "node",
  nestjs: "node",
  fastify: "node",
  laravel: "php",
  symfony: "php",
  "php-plain": "php",
  django: "python",
  fastapi: "python",
  flask: "python",
};

/**
 * Architectures each framework can emit, in display order (idiomatic default first). The
 * generators back exactly these combinations; anything absent here is an unsupported combo.
 */
export const ARCHITECTURES_BY_FRAMEWORK: Record<Framework, Architecture[]> = {
  // Node
  express: ["layered", "clean", "onion", "monolithic"],
  nestjs: ["mvc", "layered", "clean", "microservices", "mvvm"],
  fastify: ["layered", "clean", "onion", "monolithic"],
  // PHP
  laravel: ["mvc", "layered", "clean", "mvvm"],
  symfony: ["mvc", "layered", "clean", "mvvm"],
  "php-plain": ["layered", "clean"],
  // Python
  django: ["mvc", "layered", "clean"],
  fastapi: ["layered", "clean", "onion", "monolithic", "microservices"],
  flask: ["layered", "clean", "onion", "monolithic"],
};

/** The idiomatic default architecture for each framework (first entry of its list). */
export const DEFAULT_ARCHITECTURE: Record<Framework, Architecture> = {
  express: "layered",
  nestjs: "mvc",
  fastify: "layered",
  laravel: "mvc",
  symfony: "mvc",
  "php-plain": "layered",
  django: "mvc",
  fastapi: "layered",
  flask: "layered",
};

// ---------------------------------------------------------------------------
// Human-readable metadata (labels + one-line descriptions) for the selectors.
// ---------------------------------------------------------------------------

export const RUNTIME_LABELS: Record<Runtime, string> = {
  node: "Node.js",
  php: "PHP",
  python: "Python",
};

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  express: "Express.js",
  nestjs: "NestJS",
  fastify: "Fastify",
  laravel: "Laravel",
  symfony: "Symfony",
  "php-plain": "Plain PHP",
  django: "Django",
  fastapi: "FastAPI",
  flask: "Flask",
};

export const ARCHITECTURE_LABELS: Record<Architecture, string> = {
  layered: "Layered",
  clean: "Clean Architecture",
  onion: "Onion Architecture",
  monolithic: "Monolithic",
  mvc: "MVC",
  mvvm: "MVVM",
  microservices: "Microservices",
};

export const ARCHITECTURE_DESCRIPTIONS: Record<Architecture, string> = {
  layered:
    "Horizontal layers — routes → controllers → services → models. The default, pragmatic split.",
  clean:
    "Clean Architecture — domain entities and use-cases at the centre, framework and IO at the edge; dependencies point inward.",
  onion:
    "Onion Architecture — concentric rings (domain core → application → infrastructure → presentation); the core depends on nothing outward.",
  monolithic:
    "Modular monolith — one deployable, organised into self-contained feature modules.",
  mvc: "Model-View-Controller — the framework's idiomatic models/controllers split with serializers as the view.",
  mvvm: "Model-View-ViewModel — an explicit view-model / resource layer mediates between models and transport.",
  microservices:
    "Microservices — one small service per bounded context (per entity group), each independently runnable, plus a gateway.",
};

// ---------------------------------------------------------------------------
// Validation helpers.
// ---------------------------------------------------------------------------

export function frameworksForRuntime(runtime: Runtime): Framework[] {
  return FRAMEWORKS_BY_RUNTIME[runtime] ?? [];
}

export function architecturesForFramework(framework: Framework): Architecture[] {
  return ARCHITECTURES_BY_FRAMEWORK[framework] ?? [];
}

export function isFrameworkOfRuntime(runtime: Runtime, framework: Framework): boolean {
  return frameworksForRuntime(runtime).includes(framework);
}

export function isArchitectureSupported(framework: Framework, architecture: Architecture): boolean {
  return architecturesForFramework(framework).includes(architecture);
}

export function defaultFrameworkFor(runtime: Runtime): Framework {
  return frameworksForRuntime(runtime)[0];
}

export function defaultArchitectureFor(framework: Framework): Architecture {
  return DEFAULT_ARCHITECTURE[framework] ?? architecturesForFramework(framework)[0];
}

/**
 * Explain, in one sentence, why a given architecture is NOT offered for a framework — used for
 * the disabled-option tooltips in the UI. Returns null when the combination IS supported.
 */
export function disabledReason(framework: Framework, architecture: Architecture): string | null {
  if (isArchitectureSupported(framework, architecture)) return null;
  const fw = FRAMEWORK_LABELS[framework];
  switch (architecture) {
    case "microservices":
      return `${fw} generates a single deployable here; microservices is offered only where a multi-service layout is idiomatic (NestJS, FastAPI).`;
    case "mvvm":
      return `${fw} has no distinct view-model layer to justify MVVM; it is offered where a resource/serializer layer maps cleanly (NestJS, Laravel, Symfony).`;
    case "mvc":
      return `${fw} is not structured around framework controllers/views; MVC is offered for Laravel, Symfony, NestJS and Django.`;
    case "onion":
    case "monolithic":
      return `${fw}'s idiomatic layouts don't include ${ARCHITECTURE_LABELS[architecture]} here; pick one of: ${architecturesForFramework(framework).map((a) => ARCHITECTURE_LABELS[a]).join(", ")}.`;
    default:
      return `${ARCHITECTURE_LABELS[architecture]} is not available for ${fw}.`;
  }
}

/**
 * Fully validate a (runtime, framework, architecture) triple against the matrix. Returns null
 * when valid, or a precise, actionable error message when not.
 */
export function validateCombination(
  runtime: Runtime,
  framework: Framework,
  architecture: Architecture,
): string | null {
  if (!RUNTIMES.includes(runtime)) {
    return `Unknown runtime "${runtime}". Supported: ${RUNTIMES.join(", ")}.`;
  }
  if (!isFrameworkOfRuntime(runtime, framework)) {
    return `Framework "${framework}" is not a ${RUNTIME_LABELS[runtime]} framework. ${RUNTIME_LABELS[runtime]} frameworks: ${frameworksForRuntime(runtime).join(", ")}.`;
  }
  if (!isArchitectureSupported(framework, architecture)) {
    return `Architecture "${architecture}" is not supported for ${FRAMEWORK_LABELS[framework]}. Supported: ${architecturesForFramework(framework).join(", ")}.`;
  }
  return null;
}

/** A flat descriptor of one valid combination — handy for the UI and for logging the matrix. */
export interface CombinationInfo {
  runtime: Runtime;
  framework: Framework;
  architecture: Architecture;
  isDefault: boolean;
}

/** Every valid (runtime, framework, architecture) triple the matrix permits, in display order. */
export function allCombinations(): CombinationInfo[] {
  const out: CombinationInfo[] = [];
  for (const runtime of RUNTIMES) {
    for (const framework of frameworksForRuntime(runtime)) {
      for (const architecture of architecturesForFramework(framework)) {
        out.push({
          runtime,
          framework,
          architecture,
          isDefault: architecture === defaultArchitectureFor(framework),
        });
      }
    }
  }
  return out;
}
