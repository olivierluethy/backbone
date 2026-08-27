import {
  ARCHITECTURE_LABELS,
  FRAMEWORK_LABELS,
  type Architecture,
  type Framework,
  type Runtime,
} from "@backbone/core";
import type { Preset } from "../types.js";
import { nodeExpressPresets } from "./node-express.js";
import { phpPlainPresets } from "./php-plain.js";
import { pythonFastapiPresets } from "./python-fastapi.js";
import { pythonDjangoPresets } from "./python-django.js";

/**
 * The preset registry. Each framework module exports one or more `Preset`s — one per
 * (framework × architecture) combination it supports. Resolution is an exact match on the
 * (runtime, framework, architecture) triple. The set of *offered* combinations lives in the
 * core capability matrix; a preset must exist here for a combination to actually generate.
 */
const PRESETS: Preset[] = [
  ...nodeExpressPresets,
  ...phpPlainPresets,
  ...pythonFastapiPresets,
  ...pythonDjangoPresets,
];

export interface PresetInfo {
  id: string;
  runtime: Runtime;
  framework: Framework;
  architecture: Architecture;
  label: string;
}

function labelFor(p: Preset): string {
  return `${FRAMEWORK_LABELS[p.framework]} · ${ARCHITECTURE_LABELS[p.architecture]}`;
}

export function listPresets(): PresetInfo[] {
  return PRESETS.map((p) => ({
    id: p.id,
    runtime: p.runtime,
    framework: p.framework,
    architecture: p.architecture,
    label: labelFor(p),
  }));
}

/** True iff a template set is registered for this exact triple. */
export function hasPreset(runtime: Runtime, framework: Framework, architecture: Architecture): boolean {
  return PRESETS.some(
    (p) => p.runtime === runtime && p.framework === framework && p.architecture === architecture,
  );
}

/**
 * Resolve a template set by (runtime, framework, architecture), throwing a precise error if the
 * combination has no registered preset.
 */
export function getPreset(
  runtime: Runtime,
  framework: Framework,
  architecture: Architecture,
): Preset {
  const found = PRESETS.find(
    (p) => p.runtime === runtime && p.framework === framework && p.architecture === architecture,
  );
  if (!found) {
    const supported = listPresets()
      .map((p) => `${p.runtime}/${p.framework}/${p.architecture}`)
      .join(", ");
    throw new Error(
      `No template set for ${runtime}/${framework}/${architecture}. Supported: ${supported}.`,
    );
  }
  return found;
}
