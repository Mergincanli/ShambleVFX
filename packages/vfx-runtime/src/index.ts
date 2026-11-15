/**
 * @shamble/vfx-runtime: plays Shamble VFX effect files on three.js.
 * The core (no three.js) works out what to draw; VfxRenderer draws it.
 */
export * from './core/index';
export { VfxRenderer } from './three/VfxRenderer';
export type { DrawParams, VfxStats } from './three/VfxRenderer';
export { atlasLookup } from './three/atlas';
export type { Atlas, AtlasRect } from './three/atlas';
export { loadExport, VfxLoadError } from './load';
export type { LoadedExport, LoadOptions } from './load';
// What the game needs from the file format, so it can import everything from the runtime.
export { FORMAT_VERSION, EXPORT_VERSION, FACTION_IDS, TIER_NAMES, resolveRole } from '@shamble/vfx-format';
export type { EffectFile, ExportManifest, FactionId, Palette, TierName } from '@shamble/vfx-format';
