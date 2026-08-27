import type { Architecture, Runtime } from "@backbone/core";
import type { Preset } from "../types.js";
import { nodeLayeredPreset } from "./node-layered.js";
import { nodeModularPreset } from "./node-modular.js";
import { phpLayeredPreset } from "./php-layered.js";

const PRESETS: Preset[] = [nodeLayeredPreset, nodeModularPreset, phpLayeredPreset];

export interface PresetInfo {
  id: string;
  runtime: Runtime;
  architecture: Architecture;
  label: string;
}

export function listPresets(): PresetInfo[] {
  return PRESETS.map((p) => ({
    id: p.id,
    runtime: p.runtime,
    architecture: p.architecture,
    label: `${p.runtime} · ${p.architecture}`,
  }));
}

/** Resolve a template set by runtime + architecture, throwing if the combo is unsupported. */
export function getPreset(runtime: Runtime, architecture: Architecture): Preset {
  const found = PRESETS.find((p) => p.runtime === runtime && p.architecture === architecture);
  if (!found) {
    const supported = listPresets()
      .map((p) => `${p.runtime}/${p.architecture}`)
      .join(", ");
    throw new Error(
      `No template set for ${runtime}/${architecture}. Supported: ${supported}.`,
    );
  }
  return found;
}
