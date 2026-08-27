import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

/** Placeholder — implemented in the node-modular step. */
export const nodeModularPreset: Preset = {
  id: "node-modular",
  runtime: "node",
  architecture: "modular",
  templateDir: "node-modular",
  build(_ctx: GenContext): GenFile[] {
    throw new Error("node-modular preset not yet implemented");
  },
  migration(_ctx: GenContext, _plan: MigrationPlan): MigrationFile | null {
    return null;
  },
};
