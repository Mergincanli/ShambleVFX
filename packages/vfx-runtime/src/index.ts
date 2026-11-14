/**
 * @shamble/vfx-runtime: plays Shamble VFX effect files on three.js.
 * The core (no three.js) works out what to draw; VfxRenderer draws it.
 */
export * from './core/index';
export { VfxRenderer } from './three/VfxRenderer';
export type { DrawParams, VfxStats } from './three/VfxRenderer';
export { atlasLookup } from './three/atlas';
export type { Atlas, AtlasRect } from './three/atlas';
