import { FORMAT_ID, FORMAT_VERSION } from './types';
import type { EffectFile, ProjectileLayer, SpriteLayer } from './types';

/** The comic step rate: shapes hold for 1/12 s, like drawn animation (drawing board v7). */
export const DEFAULT_STEPS_PER_SECOND = 12;

export function newEffect(id: string, name: string): EffectFile {
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    id,
    name,
    controls: { size: 1, intensity: 1, duration: 1, colour: 'heat.2' },
    layers: [],
  };
}

export function newSpriteLayer(id: string, name: string, image: string): SpriteLayer {
  return {
    id,
    name,
    type: 'sprite',
    start: { ms: 0 },
    timing: { mode: 'steps', perSecond: DEFAULT_STEPS_PER_SECOND },
    at: { input: 'origin', offset: [0, 0, 0] },
    image,
    pivot: [0.5, 0.5],
    sizeM: [1, 1],
    tint: { mode: 'keep' },
    facing: 'camera',
    durationMs: 250,
  };
}

export function newProjectileLayer(id: string, name: string): ProjectileLayer {
  return {
    id,
    name,
    type: 'projectile',
    start: { ms: 0 },
    timing: { mode: 'steps', perSecond: DEFAULT_STEPS_PER_SECOND },
    from: { input: 'origin', offset: [0, 0, 0] },
    to: { input: 'target', offset: [0, 0, 0] },
    speedMps: 40,
    stretch: 1,
    spinDegPerS: 0,
  };
}
