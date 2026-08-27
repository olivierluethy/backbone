import type { GenContext, GenFile, MigrationFile, MigrationPlan, Preset } from "../types.js";

/** Placeholder — implemented in the php-layered step. */
export const phpLayeredPreset: Preset = {
  id: "php-layered",
  runtime: "php",
  architecture: "layered",
  templateDir: "php-layered",
  build(_ctx: GenContext): GenFile[] {
    throw new Error("php-layered preset not yet implemented");
  },
  migration(_ctx: GenContext, _plan: MigrationPlan): MigrationFile | null {
    return null;
  },
};
