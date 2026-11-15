/**
 * The schema of an effect file (the current version, FORMAT_VERSION), written with zod.
 * Only the editor, the tests and the export tools load this file. The runtime never does.
 */
import { z } from 'zod';
import { GRADIENT_NAME } from '../palette';
import { FORMAT_ID, FORMAT_VERSION } from '../types';
import type { EffectFile } from '../types';

const num = z.number();
const pos = (what = 'must be more than 0') => num.positive({ error: what });
const unit = num.min(0, { error: 'must be between 0 and 1' }).max(1, { error: 'must be between 0 and 1' });
const range = (lo: number, hi: number) => z.tuple([num.min(lo).max(hi), num.min(lo).max(hi)]).refine((r) => r[0] <= r[1], { error: 'the first number must not be bigger than the second' });
const curve = z.array(z.tuple([unit, num.min(-100).max(100)])).min(1).max(32);

export const idSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,47}$/, { error: 'use lowercase letters, digits and _, starting with a letter (48 at most)' });

const nameSchema = z.string().min(1, { error: 'needs a name' }).max(80, { error: 'is longer than 80 letters' });

/** A role name such as heat.2, team, glow, gunword.top. Never a hex colour. */
export const roleSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/, { error: 'must be a colour role name such as heat.2 or glow, never a hex colour' });

/** A gradient's name in the palette, written like a role's: glow.ramp, fire.bed (the palette's own rule). */
const gradientNameSchema = z.string().regex(GRADIENT_NAME, { error: 'must be a gradient name such as glow.ramp' });

/** A PNG file name in the project's images folder: no folders, no "..". */
export const imageNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}\.png$/, { error: 'must be a .png file name in the images folder, without folders' })
  .refine((s) => !s.includes('..'), { error: 'must not contain ".."' });

const vec3 = z.tuple([num, num, num]);
const vec2 = z.tuple([num, num]);
const phaseName = z.enum(['windup', 'peak', 'fade']);
const edge = z.enum(['auto', 'enemy', 'ink', 'broken', 'none']);
const px = num.min(0, { error: 'must be 0 or more' }).max(200, { error: 'must be 200 px or less' });
const metres = (max = 100) => num.min(0, { error: 'must be 0 or more' }).max(max, { error: `must be ${max} m or less` });

export const inputAnchorSchema = z.strictObject({ input: z.enum(['origin', 'target']), offset: vec3 });
const layerAnchorSchema = z.strictObject({ layer: idSchema });
const anchorSchema = z.union([inputAnchorSchema, layerAnchorSchema]);

const startSchema = z.union([
  z.strictObject({ ms: num.min(0, { error: 'must be 0 or more' }) }),
  z.strictObject({ arrivalOf: idSchema, ms: num.min(0, { error: 'must be 0 or more' }) }),
  z.strictObject({ phase: phaseName, ms: num.min(0, { error: 'must be 0 or more' }) }),
]);

const timingSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('steps'), perSecond: z.int().min(1, { error: 'must be at least 1' }).max(60, { error: 'must be 60 or less' }) }),
  z.strictObject({ mode: z.literal('smooth') }),
]);

const tintSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('keep') }),
  z.strictObject({ mode: z.literal('multiply'), role: roleSchema }),
]);

const flipbookSchema = z
  .strictObject({ cols: z.int().min(1).max(64), rows: z.int().min(1).max(64), frames: z.int().min(1), loop: z.boolean() })
  .refine((f) => f.frames <= f.cols * f.rows, { error: 'has more frames than cells in its grid', path: ['frames'] });

const scaleSchema = z.strictObject({ steps: z.array(num.min(0).max(20)).max(60).optional(), life: curve.optional() });

const breakUpSchema = z.union([z.strictObject({ phase: phaseName }), z.strictObject({ lastMs: pos() })]);
const toneSchema = z.strictObject({ role: roleSchema, scale: num.min(0).max(5), points: z.int().min(3).max(64).optional(), vanishAt: unit.optional() });
const tones = z.array(toneSchema).min(1, { error: 'needs at least one tone' }).max(8);
const halftoneSchema = z.strictObject({ role: roleSchema, stepPx: pos().max(200), dotPx: pos().max(100), towardDeg: num });

const common = {
  id: idSchema,
  name: nameSchema,
  start: startSchema,
  timing: timingSchema,
};
const tierList = z.array(z.enum(['low', 'medium', 'high'])).min(1, { error: 'needs at least one tier' }).max(3)
  .refine((t) => new Set(t).size === t.length, { error: 'names a tier twice' });

const visible = {
  ...common,
  tiers: tierList,
  at: anchorSchema,
  facing: z.enum(['camera', 'path', 'ground', 'upright']),
  blend: z.enum(['normal', 'multiply', 'screen', 'add']),
  durationMs: pos().max(600000, { error: 'must be 10 minutes or less' }).optional(),
  untilPhaseEnd: phaseName.optional(),
  scale: scaleSchema.optional(),
  alpha: z.strictObject({ steps: z.array(unit).max(60).optional(), life: curve.optional() }).optional(),
  shiftM: vec2.optional(),
  liftM: num.min(0).max(50).optional(),
};

export const spriteLayerSchema = z.strictObject({
  ...visible,
  type: z.literal('sprite'),
  image: imageNameSchema,
  flipbook: flipbookSchema.optional(),
  pivot: z.tuple([unit, unit]),
  sizeM: z.tuple([pos().max(100, { error: 'must be 100 m or less' }), pos().max(100, { error: 'must be 100 m or less' })]),
  tint: tintSchema,
});

export const projectileLayerSchema = z.strictObject({
  ...common,
  type: z.literal('projectile'),
  from: inputAnchorSchema,
  to: inputAnchorSchema,
  flight: z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('speed'), mps: pos().max(10000, { error: 'must be 10000 m/s or less' }) }),
    z.strictObject({ mode: z.literal('time'), ms: num.min(0).max(60000) }),
    z.strictObject({ mode: z.literal('phase'), phase: phaseName }),
  ]),
  arcM: num.min(-50).max(50),
  stretch: num.min(0.05, { error: 'must be at least 0.05' }).max(100, { error: 'must be 100 or less' }),
  spinDegPerS: num.min(-36000).max(36000),
});

const shapeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('shards'), radiusM: pos().max(50), points: z.int().min(3).max(64), inner: unit, jitter: unit, squash: num.min(0.05).max(1),
    rotationDeg: num, tones, inkPx: px, edge, whiteFirstStep: z.boolean(), boilDeg: num.min(-90).max(90), breakUp: breakUpSchema.optional(),
    double: z.boolean(), halftone: halftoneSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('flash'), lengthM: pos().max(20), tones, inkPx: px, edge,
    alternate: z.strictObject({ scale: num.min(0).max(2), jitter: num.min(0).max(1) }),
  }),
  z.strictObject({
    kind: z.literal('cloud'), radiusM: pos().max(50), squash: num.min(0.05).max(1), lobes: z.int().min(3).max(64), lobeDepth: unit, tones, inkPx: px, edge,
    boilDeg: num.min(-90).max(90), breakUp: breakUpSchema.optional(), halftone: halftoneSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('smoke'), style: z.enum(['puff', 'billow']), radiusM: pos().max(50), role: roleSchema, gradient: gradientNameSchema.optional(),
    lightRole: roleSchema.optional(), rimRole: roleSchema,
    inkPx: px, grow: z.tuple([num.min(0).max(10), num.min(0).max(10), num.min(0).max(10)]), riseM: num.min(-50).max(50), driftM: vec2,
    loop: z.strictObject({ count: z.int().min(1).max(32), lifeMs: pos() }).optional(),
  }),
  z.strictObject({
    kind: z.literal('ring'), radiusM: pos().max(100), widthPx: pos().max(100), inkPx: px, role: roleSchema,
    style: z.enum(['auto-zigzag', 'auto-teeth', 'solid', 'dashed', 'zigzag', 'teeth']),
    teeth: z.int().min(0).max(128), teethM: metres(10), growFrom: unit, growMs: num.min(0).max(60000), dashAt: unit.optional(), breakUp: breakUpSchema.optional(),
    squash: num.min(0.05).max(4).optional(), closing: z.strictObject({ count: z.int().min(1).max(16), periodMs: pos(), fromM: metres(), toM: metres() }).optional(),
  }),
  z.strictObject({
    kind: z.literal('dots'), radiusM: pos().max(100), innerM: metres(), edgeM: metres(), stepPx: pos().max(200), dotPx: pos().max(100), role: roleSchema, alpha: unit,
    growFrom: unit, growMs: num.min(0).max(60000), flickerM: num.min(0).max(10), squash: num.min(0.05).max(4).optional(), breakUp: breakUpSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('scorch'), style: z.enum(['oval', 'splat']), radiusM: pos().max(100), role: roleSchema, coreScale: unit, coreRole: roleSchema,
    lobes: z.int().min(0).max(32), growMs: num.min(0).max(60000),
  }),
  z.strictObject({
    kind: z.literal('lines'), count: z.int().min(1).max(256), innerM: range(0, 100), lengthM: range(0, 100), widthPx: range(0, 50), role: roleSchema,
    until: unit, spread: num.min(0).max(10),
  }),
  z.strictObject({
    kind: z.literal('glow'), radiusM: pos().max(100), role: roleSchema, alpha: unit, soft: z.boolean(), grow: z.tuple([num.min(0).max(10), num.min(0).max(10)]), flicker: num.min(0).max(2),
    gradient: gradientNameSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('trail'), length: unit, widthPx: z.tuple([px, px]), role: roleSchema,
    head: z.strictObject({ role: roleSchema, share: unit }).optional(),
    core: z.strictObject({ role: roleSchema, px, edge }).optional(),
    inkPx: px, edge, breakUp: breakUpSchema.optional(), dashes: z.int().min(1).max(32),
  }),
  z.strictObject({
    kind: z.literal('band'), from: inputAnchorSchema, to: inputAnchorSchema, widthM: z.tuple([metres(20), metres(20)]), role: roleSchema, alpha: unit, soft: z.boolean(),
    edge, flicker: num.min(0).max(2), find: phaseName.optional(), letGo: phaseName.optional(),
  }),
  z.strictObject({
    kind: z.literal('beads'), from: inputAnchorSchema, to: inputAnchorSchema, count: z.int().min(1).max(32), periodMs: pos(), sizeM: pos().max(10), role: roleSchema,
    glowRole: roleSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('flames'), radiusM: pos().max(50), count: z.int().min(1).max(64), depth: z.enum(['back', 'middle', 'front', 'all']), tallM: range(0, 20), widthM: range(0, 10),
    lean: num.min(-2).max(2), sway: num.min(0).max(2), cycleSteps: range(1, 60), tones: z.array(roleSchema).min(2).max(6), shadeRole: roleSchema, inkPx: px, edge,
    licks: z.boolean(), growMs: num.min(0).max(60000), breakUp: breakUpSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('bed'), radiusM: pos().max(50), tones: z.array(roleSchema).min(1).max(8), gradient: gradientNameSchema.optional(), lumps: z.int().min(3).max(64),
    part: z.enum(['lumps', 'detail']),
    detailRole: roleSchema, inkPx: px, edge, boilSteps: z.int().min(1).max(60), growMs: num.min(0).max(60000), breakUp: breakUpSchema.optional(),
  }),
]);

const seedFields = { seed: z.int().min(0).max(0xffffffff), perPlay: z.boolean() };

export const shapeLayerSchema = z.strictObject({ ...visible, type: z.literal('shape'), shape: shapeSchema, ...seedFields });

const lookSchema = z.union([
  z.strictObject({ kind: z.enum(['diamond', 'chip', 'spark', 'dot', 'shard', 'speck', 'puff', 'streak', 'spike']), role: roleSchema, inkPx: px, edge, inkRole: roleSchema.optional() }),
  z.strictObject({ kind: z.literal('image'), image: imageNameSchema, tint: tintSchema }),
]);

export const burstLayerSchema = z.strictObject({
  ...visible,
  type: z.literal('burst'),
  count: z.int().min(1).max(512),
  lifeMs: range(1, 60000),
  speedMps: range(0, 1000),
  direction: z.enum(['up', 'out', 'path']),
  spreadDeg: num.min(0).max(180),
  startRadiusM: range(0, 100),
  areaM: vec2.optional(),
  gravityMps2: num.min(-100).max(100),
  drag: num.min(0).max(100),
  sizeM: range(0, 20),
  sizeOverLife: curve,
  spinDegPerS: range(-36000, 36000),
  look: lookSchema,
  gradient: gradientNameSchema.optional(),
  loop: z.boolean(),
  streak: z.strictObject({ role: roleSchema, lengthM: pos().max(20), widthPx: pos().max(100) }).optional(),
  groundStop: z.boolean(),
  ...seedFields,
});

export const wordLayerSchema = z.strictObject({
  ...visible,
  type: z.literal('word'),
  words: z.array(z.strictObject({
    text: z.string().min(1).max(24),
    chance: num.min(0, { error: 'must be 0 % or more' }).max(100, { error: 'must be 100 % or less' }).optional(),
  })).min(1, { error: 'needs at least one word' }).max(16),
  letterPx: pos().max(400),
  colours: z.strictObject({ top: roleSchema, bottom: roleSchema, back: roleSchema }),
  separation: roleSchema.optional(),
  tiltDeg: range(-45, 45),
  sizeJitter: num.min(0).max(1),
  ramp: num.min(-1).max(1),
  bounce: num.min(0).max(3),
  turnDeg: num.min(0).max(45),
  slantDeg: num.min(-45).max(45),
  pop: z.strictObject({ scale: num.min(0).max(5), steps: z.int().min(0).max(30) }),
  breakUp: breakUpSchema.optional(),
  breakSteps: z.int().min(0).max(30),
  riseM: num.min(-20).max(20),
  distance: z.strictObject({ curve: z.array(z.tuple([num.min(0).max(1000), num.min(0).max(5)])).min(1).max(16), minPx: num.min(0).max(200) }),
  visibleTo: z.enum(['everyone', 'shooter']),
  ...seedFields,
});

export const layerSchema = z.discriminatedUnion('type', [spriteLayerSchema, projectileLayerSchema, shapeLayerSchema, burstLayerSchema, wordLayerSchema]);

export const controlsSchema = z.strictObject({
  size: pos().max(20, { error: 'must be 20 or less' }),
  intensity: num.min(0, { error: 'must be 0 or more' }).max(20, { error: 'must be 20 or less' }),
  duration: pos().max(20, { error: 'must be 20 or less' }),
  colour: roleSchema,
});

export const phasesSchema = z.strictObject({
  windupMs: num.min(0).max(600000),
  peakMs: num.min(0).max(600000),
  fadeMs: num.min(0).max(600000),
});

export const effectSchema = z.strictObject({
  format: z.literal(FORMAT_ID),
  version: z.literal(FORMAT_VERSION),
  id: idSchema,
  name: nameSchema,
  controls: controlsSchema,
  phases: phasesSchema,
  layers: z.array(layerSchema).max(96, { error: 'has more than 96 layers' }),
});

// The schema and the TypeScript types must describe the same thing. This line fails to compile if they drift.
type SchemaOut = z.infer<typeof effectSchema>;
const _sameShape: [SchemaOut extends EffectFile ? true : false, EffectFile extends SchemaOut ? true : false] = [true, true];
void _sameShape;
