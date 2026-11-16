import { FORMAT_ID, FORMAT_VERSION } from './types';
import type { TierName } from './types';
import type { BurstLayer, EffectFile, ProjectileLayer, ShapeKind, ShapeLayer, ShapeSpec, SpriteLayer, WordLayer } from './types';

/** The comic step rate: shapes hold for 1/12 s, like drawn animation (drawing board v7). */
export const DEFAULT_STEPS_PER_SECOND = 12;

/**
 * The letters drawn so far in our own block alphabet: A to Z and !. All are from drawing board v7, except J, Q, V, X
 * and Y: Shamble VFX drew those in the board's style, and they wait for the Art lead's review. A space in a word is not a
 * letter but a gap between two letters (vfx-runtime's drawWord). Other characters are left out of a word, and the checker
 * warns about them.
 */
export const WORD_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!';

/** The word size by distance from you (Mustafa, 2026-11-14; 0-2 m and 5-8 m are the Art lead's reading). */
export const DEFAULT_WORD_DISTANCE: [number, number][] = [[0, 1], [2, 1], [5, 0.6], [8, 0.6], [11, 0]];

export function newEffect(id: string, name: string): EffectFile {
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    id,
    name,
    controls: { size: 1, intensity: 1, duration: 1, colour: 'heat.2' },
    phases: { windupMs: 0, peakMs: 0, fadeMs: 0 },
    layers: [],
  };
}

const steps = () => ({ mode: 'steps' as const, perSecond: DEFAULT_STEPS_PER_SECOND });
const atOrigin = () => ({ input: 'origin' as const, offset: [0, 0, 0] as [number, number, number] });

export function newSpriteLayer(id: string, name: string, image: string): SpriteLayer {
  return {
    id, name, type: 'sprite', start: { ms: 0 }, timing: steps(), tiers: allTiers(), at: atOrigin(), facing: 'camera', blend: 'normal',
    image, pivot: [0.5, 0.5], sizeM: [1, 1], tint: { mode: 'keep' }, durationMs: 250,
  };
}

export function newProjectileLayer(id: string, name: string): ProjectileLayer {
  return {
    id, name, type: 'projectile', start: { ms: 0 }, timing: steps(),
    from: atOrigin(), to: { input: 'target', offset: [0, 0, 0] },
    flight: { mode: 'speed', mps: 40 }, arcM: 0, stretch: 1, spinDegPerS: 0,
  };
}

const heatTones = () => [
  { role: 'heat.1', scale: 1, vanishAt: 0.4 },
  { role: 'heat.2', scale: 0.72, vanishAt: 0.62 },
  { role: 'heat.3', scale: 0.47, vanishAt: 0.82 },
  { role: 'heat.4', scale: 0.25, vanishAt: 0.94 },
];

/** A sensible starting shape of each kind. Ink widths are px at 1080p. */
export function defaultShape(kind: ShapeKind): ShapeSpec {
  switch (kind) {
    case 'shards':
      return { kind, radiusM: 1.1, points: 11, inner: 0.5, jitter: 0.3, squash: 0.86, rotationDeg: 0, tones: heatTones(), inkPx: 4.2, edge: 'auto', whiteFirstStep: false, boilDeg: 2.3, double: false };
    case 'flash':
      return { kind, lengthM: 0.95, tones: [{ role: 'heat.1', scale: 1 }, { role: 'heat.2', scale: 0.72 }, { role: 'heat.3', scale: 0.46 }, { role: 'heat.4', scale: 0.24 }], inkPx: 4.9, edge: 'auto', alternate: { scale: 0.82, jitter: 0.08 } };
    case 'cloud':
      return { kind, radiusM: 1, squash: 0.82, lobes: 13, lobeDepth: 0.16, tones: [{ role: 'heat.1', scale: 1 }, { role: 'heat.2', scale: 0.8 }, { role: 'heat.3', scale: 0.58 }, { role: 'heat.4', scale: 0.34 }], inkPx: 3, edge: 'ink', boilDeg: 2 };
    case 'smoke':
      return { kind, style: 'puff', radiusM: 0.4, role: 'smoke.light', rimRole: 'ink', inkPx: 3, grow: [0.75, 1.65, 0], riseM: 0.6, driftM: [0, 0] };
    case 'ring':
      return { kind, radiusM: 1.4, widthPx: 4, inkPx: 8, role: 'team', style: 'auto-zigzag', teeth: 26, teethM: 0.3, growFrom: 0.55, growMs: 72 };
    case 'dots':
      return { kind, radiusM: 1.9, innerM: 0, edgeM: 0, stepPx: 9.4, dotPx: 4, role: 'heat.2', alpha: 1, growFrom: 0.55, growMs: 72, flickerM: 0 };
    case 'scorch':
      return { kind, style: 'oval', radiusM: 1.12, role: 'scorch.1', coreScale: 0.6, coreRole: 'scorch.2', lobes: 0, growMs: 0 };
    case 'lines':
      return { kind, count: 9, innerM: [1.23, 1.45], lengthM: [0.33, 0.55], widthPx: [2.6, 2.6], role: 'ink', until: 0.5, spread: 0.5 };
    case 'glow':
      return { kind, radiusM: 1, role: 'glow', alpha: 0.6, soft: true, grow: [1, 1], flicker: 0 };
    case 'trail':
      return { kind, length: 0.1, widthPx: [4.5, 4.5], role: 'team', head: { role: 'heat.3', share: 0.4 }, inkPx: 1.75, edge: 'ink', dashes: 5 };
    case 'band':
      return { kind, from: atOrigin(), to: { input: 'target', offset: [0, 0, 0] }, widthM: [0.17, 0.12], role: 'glow.hot', alpha: 1, soft: false, edge: 'auto', flicker: 0.1 };
    case 'beads':
      return { kind, from: { input: 'target', offset: [0, 0, 0] }, to: atOrigin(), count: 3, periodMs: 700, sizeM: 0.24, role: 'white', glowRole: 'glow' };
    case 'flames':
      return { kind, radiusM: 2.2, count: 7, depth: 'all', tallM: [1.2, 3], widthM: [0.24, 0.4], lean: 0.16, sway: 0.12, cycleSteps: [5, 8], tones: ['heat.1', 'heat.2', 'heat.3', 'heat.4'], shadeRole: 'heat.dark', inkPx: 4.25, edge: 'auto', licks: true, growMs: 250 };
    case 'bed':
      return { kind, radiusM: 2.2, tones: ['heat.dark', 'heat.1', 'heat.2', 'heat.3'], lumps: 12, part: 'lumps', detailRole: 'heat.deep', inkPx: 4.25, edge: 'auto', boilSteps: 2, growMs: 250 };
  }
}

/** Where a new layer of each shape kind is best placed: lying on the ground, or standing in front of the camera. */
export function defaultFacing(kind: ShapeKind): ShapeLayer['facing'] {
  return kind === 'ring' || kind === 'scorch' || kind === 'dots' ? 'ground' : kind === 'flames' || kind === 'smoke' || kind === 'band' || kind === 'beads' ? 'upright' : kind === 'flash' || kind === 'trail' ? 'path' : 'camera';
}

export function newShapeLayer(id: string, name: string, kind: ShapeKind): ShapeLayer {
  return {
    id, name, type: 'shape', start: { ms: 0 }, timing: steps(), tiers: allTiers(), at: atOrigin(), facing: defaultFacing(kind),
    blend: kind === 'scorch' ? 'multiply' : kind === 'glow' ? 'add' : 'normal', durationMs: 500,
    shape: defaultShape(kind), seed: 1, perPlay: true,
  };
}

export function newBurstLayer(id: string, name: string): BurstLayer {
  return {
    id, name, type: 'burst', start: { ms: 0 }, timing: steps(), tiers: allTiers(), at: atOrigin(), facing: 'camera', blend: 'normal',
    count: 9, lifeMs: [600, 900], speedMps: [3, 6], direction: 'out', spreadDeg: 35, startRadiusM: [0.5, 0.7], gravityMps2: 9.8, drag: 2,
    sizeM: [0.08, 0.12], sizeOverLife: [[0, 1], [1, 0.5]], spinDegPerS: [0, 0],
    look: { kind: 'diamond', role: 'team', inkPx: 1.95, edge: 'auto' }, loop: false, groundStop: true, seed: 1, perPlay: true,
  };
}

export function newWordLayer(id: string, name: string): WordLayer {
  return {
    id, name, type: 'word', start: { ms: 0 }, timing: steps(), tiers: allTiers(), at: { input: 'origin', offset: [0, 1.2, 0] }, facing: 'camera', blend: 'normal',
    durationMs: 600, words: [{ text: 'BOOM' }], letterPx: 32, colours: { top: 'white', bottom: 'glow', back: 'team.dark' },
    tiltDeg: [4, 10], sizeJitter: 0.1, ramp: 0.2, bounce: 0.35, turnDeg: 4, slantDeg: 9, pop: { scale: 1.15, steps: 2 },
    breakUp: { lastMs: 140 }, breakSteps: 0, riseM: 0, distance: { curve: DEFAULT_WORD_DISTANCE.map((p) => [...p] as [number, number]), minPx: 14 },
    visibleTo: 'everyone', seed: 1, perPlay: true,
  };
}

/** A new layer shows in every quality tier. */
function allTiers(): TierName[] {
  return ['low', 'medium', 'high'];
}
