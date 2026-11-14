/**
 * The schema of an effect file, version 1, written with zod.
 * Only the editor, the tests and the export tools load this file. The runtime never does.
 */
import { z } from 'zod';
import { FORMAT_ID, FORMAT_VERSION } from '../types';
import type { EffectFile } from '../types';

const num = z.number();

export const idSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,47}$/, { error: 'use lowercase letters, digits and _, starting with a letter (48 at most)' });

const nameSchema = z.string().min(1, { error: 'needs a name' }).max(80, { error: 'is longer than 80 letters' });

/** A role name such as heat.2, team, glow, gunword.top. Never a hex colour. */
export const roleSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/, { error: 'must be a colour role name such as heat.2 or glow, never a hex colour' });

/** A PNG file name in the project's images folder: no folders, no "..". */
export const imageNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}\.png$/, { error: 'must be a .png file name in the images folder, without folders' })
  .refine((s) => !s.includes('..'), { error: 'must not contain ".."' });

const vec3 = z.tuple([num, num, num]);
const unit = num.min(0, { error: 'must be between 0 and 1' }).max(1, { error: 'must be between 0 and 1' });

export const inputAnchorSchema = z.strictObject({
  input: z.enum(['origin', 'target']),
  offset: vec3,
});

const layerAnchorSchema = z.strictObject({ layer: idSchema });

const anchorSchema = z.union([inputAnchorSchema, layerAnchorSchema]);

const startSchema = z.union([
  z.strictObject({ ms: num.min(0, { error: 'must be 0 or more' }) }),
  z.strictObject({ arrivalOf: idSchema, ms: num.min(0, { error: 'must be 0 or more' }) }),
]);

const timingSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('steps'),
    perSecond: z.int().min(1, { error: 'must be at least 1' }).max(60, { error: 'must be 60 or less' }),
  }),
  z.strictObject({ mode: z.literal('smooth') }),
]);

const tintSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('keep') }),
  z.strictObject({ mode: z.literal('multiply'), role: roleSchema }),
]);

const flipbookSchema = z
  .strictObject({
    cols: z.int().min(1).max(64),
    rows: z.int().min(1).max(64),
    frames: z.int().min(1),
    loop: z.boolean(),
  })
  .refine((f) => f.frames <= f.cols * f.rows, { error: 'has more frames than cells in its grid', path: ['frames'] });

export const spriteLayerSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  type: z.literal('sprite'),
  start: startSchema,
  timing: timingSchema,
  at: anchorSchema,
  image: imageNameSchema,
  flipbook: flipbookSchema.optional(),
  pivot: z.tuple([unit, unit]),
  sizeM: z.tuple([
    num.positive({ error: 'must be more than 0' }).max(100, { error: 'must be 100 m or less' }),
    num.positive({ error: 'must be more than 0' }).max(100, { error: 'must be 100 m or less' }),
  ]),
  tint: tintSchema,
  facing: z.enum(['camera', 'path']),
  durationMs: num.positive({ error: 'must be more than 0' }).max(600000, { error: 'must be 10 minutes or less' }).optional(),
});

export const projectileLayerSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  type: z.literal('projectile'),
  start: startSchema,
  timing: timingSchema,
  from: inputAnchorSchema,
  to: inputAnchorSchema,
  speedMps: num.positive({ error: 'must be more than 0' }).max(10000, { error: 'must be 10000 m/s or less' }),
  stretch: num.min(0.05, { error: 'must be at least 0.05' }).max(100, { error: 'must be 100 or less' }),
  spinDegPerS: num.min(-36000).max(36000),
});

export const layerSchema = z.discriminatedUnion('type', [spriteLayerSchema, projectileLayerSchema]);

export const controlsSchema = z.strictObject({
  size: num.positive({ error: 'must be more than 0' }).max(20, { error: 'must be 20 or less' }),
  intensity: num.min(0, { error: 'must be 0 or more' }).max(20, { error: 'must be 20 or less' }),
  duration: num.positive({ error: 'must be more than 0' }).max(20, { error: 'must be 20 or less' }),
  colour: roleSchema,
});

export const effectSchema = z.strictObject({
  format: z.literal(FORMAT_ID),
  version: z.literal(FORMAT_VERSION),
  id: idSchema,
  name: nameSchema,
  controls: controlsSchema,
  layers: z.array(layerSchema).max(64, { error: 'has more than 64 layers' }),
});

// The schema and the TypeScript types must describe the same thing. This line fails to compile if they drift.
type SchemaOut = z.infer<typeof effectSchema>;
const _sameShape: [SchemaOut extends EffectFile ? true : false, EffectFile extends SchemaOut ? true : false] = [true, true];
void _sameShape;
