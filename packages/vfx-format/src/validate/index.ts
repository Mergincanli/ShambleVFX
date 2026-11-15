/**
 * @shamble/vfx-format/validate: the schema, the checker and the upgrades.
 * The editor, the tests and the export tools use this. The runtime does not (it would pull zod into the game).
 */
import { z } from 'zod';
import { FORMAT_VERSION } from '../types';
import { effectSchema } from './schema';

export { checkEffect, problemLines, pathText } from './check';
export type { CheckOptions, CheckResult, Problem, ProblemKind } from './check';
export { migrate, MIGRATIONS } from './migrate';
export type { Migration, MigrateResult } from './migrate';
export { effectSchema, layerSchema, spriteLayerSchema, projectileLayerSchema, controlsSchema, roleSchema, idSchema, imageNameSchema } from './schema';
export { checkExport, checkEvents, EXPORT_FORMAT, EXPORT_VERSION, EVENT_NAME } from './export';
export type { AtlasMap, ExportCheck, ExportManifest, ManifestEffect } from './export';

/** The effect file schema as JSON Schema, for other tools (and editors that read "$schema"). */
export function effectJsonSchema(): Record<string, unknown> {
  const js = z.toJSONSchema(effectSchema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://github.com/Mergincanli/ShambleVFX/schema/effect.v${FORMAT_VERSION}.schema.json`,
    title: `Shamble VFX effect file, version ${FORMAT_VERSION}`,
    description: 'Times in ms, sizes in metres, colours as role names only (hexes live in the palette).',
    ...Object.fromEntries(Object.entries(js).filter(([k]) => k !== '$schema')),
  };
}
