/**
 * Shared by the colours-used tests: draw an effect with the real runtime and note, layer by layer, every colour role and
 * gradient the runtime asks the palette for. Then compare that with the format's static list (layerColours).
 *
 * Each layer is drawn on its own: the others are left out of every tier, which changes no timing (a tier only leaves
 * layers out). That is how each request is put down to its layer: within one evaluate() call the runtime asks for a
 * colour once, whichever layer needs it first.
 *
 * Each layer is drawn in one tier: the first tier it shows in. A tier only leaves whole layers out (the runtime reads the
 * tier nowhere else), so a layer draws the same in every tier it shows in; a test below holds the runtime to that.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import paletteJson from '../../vfx-format/palette/palette.json';
import { TIER_NAMES } from '@shamble/vfx-format';
import type { EffectFile, FactionId, Palette, PaletteEntry, TierName, Vec3, VisibleLayer } from '@shamble/vfx-format';
import { layerColours } from '@shamble/vfx-format/validate';
import type { ColourList } from '@shamble/vfx-format/validate';
import { BLEND_GROUPS, DrawSink, applyControls, evaluate, resolveTimeline } from '../src/core/index';
import type { CameraBasis, EvalContext, Relation } from '../src/core/index';

export const builtIn = paletteJson as Palette;
export const RELATIONS: readonly Relation[] = ['enemy', 'team', 'self'];

/** The game camera (drawing board v7): 35.3 degrees above the ground, turned 45 degrees. */
function gameCamera(): CameraBasis {
  const p = (35.3 * Math.PI) / 180, y = (45 * Math.PI) / 180;
  const back: Vec3 = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  const forward: Vec3 = [-back[0], -back[1], -back[2]];
  const right: Vec3 = [Math.cos(y), 0, -Math.sin(y)];
  const up: Vec3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  return { right, up, forward };
}
const camera = gameCamera();
const inputs = { origin: [-4, 1.5, 3] as Vec3, target: [3, 0.8, -2] as Vec3 };

/** What the runtime asked the palette for while drawing one layer, how many triangles it drew in all, and in which tier. */
export interface Asked {
  roles: Set<string>;
  gradients: Set<string>;
  triangles: number;
  /** The tier the layer was drawn in (none for a projectile, which never draws). */
  tier?: TierName;
}

/** The palette, noting every role and every gradient looked up in it. */
function noting(base: Palette, asked: Asked): Palette {
  const roles = (o: Record<string, PaletteEntry>) => new Proxy(o, {
    get(t, k) { if (typeof k === 'string') asked.roles.add(k); return Reflect.get(t, k); },
  });
  const factions = Object.fromEntries(Object.entries(base.factions).map(([f, v]) => [f, { ...v, roles: roles(v.roles) }])) as Palette['factions'];
  const gradients = new Proxy(base.gradients ?? {}, {
    get(t, k) { if (typeof k === 'string') asked.gradients.add(k); return Reflect.get(t, k); },
  });
  return { ...base, roles: roles(base.roles), factions, gradients };
}

export interface Sweep {
  factions: readonly FactionId[];
  relations: readonly Relation[];
  seeds: readonly number[];
}

/** The tier a layer is drawn in for the sweep: the first one it shows in (low, then medium, then high). */
export function sweepTier(l: VisibleLayer): TierName | undefined {
  return TIER_NAMES.find((t) => l.tiers.includes(t));
}

/** The context the sweep draws with at one moment. */
function sweepContext(timeMs: number, faction: FactionId, relation: Relation, tier: TierName, seed: number, palette: Palette): EvalContext {
  return {
    seed, timeMs, inputs, faction, relation, tier, palette, camera,
    // As the editor's atlas: every image found, a white block and the round halftone dot.
    imageRect: () => ({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 }), white: [0.9, 0.9], dot: { u0: 0.5, v0: 0.5, u1: 0.6, v1: 0.6 },
  };
}

/** The effect with only layer i drawn (in the tiers it has): every other visible layer is left out of every tier. */
function onlyLayer(fx: EffectFile, i: number): EffectFile {
  return { ...fx, layers: fx.layers.map((m, j) => (j === i || m.type === 'projectile' ? m : { ...m, tiers: [] })) };
}

/**
 * Draw every visible layer of an effect on its own, in the first tier it shows in, at 60 frames a second over the
 * effect's whole length, for every faction, made-by and seed of the sweep, and note what the runtime asked the palette
 * for.
 */
export function askedByLayer(fx: EffectFile, palette: Palette, sweep: Sweep): Asked[] {
  const tl = resolveTimeline(fx, inputs, applyControls(fx.controls));
  const sink = new DrawSink(4096);
  return fx.layers.map((l, i) => {
    const asked: Asked = { roles: new Set(), gradients: new Set(), triangles: 0 };
    if (l.type === 'projectile') return asked;
    const tier = sweepTier(l);
    if (!tier) return asked;
    asked.tier = tier;
    const only = onlyLayer(fx, i);
    const pal = noting(palette, asked);
    for (const faction of sweep.factions) for (const relation of sweep.relations) for (const seed of sweep.seeds) {
      for (let k = 0; (k * 1000) / 60 <= tl.lengthMs; k++) {
        sink.clear();
        asked.triangles += evaluate(only, sweepContext((k * 1000) / 60, faction, relation, tier, seed, pal), sink, tl).triangles;
      }
    }
    return asked;
  });
}

/** What a layer drew at one moment: every vertex (position and colour) and every index, in order, group by group. */
export type Picture = number[][];
const pictureSink = new DrawSink(4096);

/** What layer i draws at one moment in one tier. Used to show that a layer draws the same in each tier it shows in. */
export function layerPicture(fx: EffectFile, i: number, timeMs: number, tier: TierName, relation: Relation, faction: FactionId): Picture {
  const tl = resolveTimeline(fx, inputs, applyControls(fx.controls));
  pictureSink.clear();
  evaluate(onlyLayer(fx, i), sweepContext(timeMs, faction, relation, tier, 1, builtIn), pictureSink, tl);
  return BLEND_GROUPS.flatMap((g) => {
    const b = pictureSink.groups[g];
    return [Array.from(b.pos.subarray(0, b.vcount * 4)), Array.from(b.col.subarray(0, b.vcount * 4)), Array.from(b.idx.subarray(0, b.icount))];
  });
}

/** True when two pictures are the same to the bit. */
export function samePicture(a: Picture, b: Picture): boolean {
  return a.length === b.length && a.every((x, k) => x.length === b[k]!.length && x.every((v, j) => Object.is(v, b[k]![j])));
}

/** One colour in the static list that the runtime never asked for, with why that is fine. */
export interface Extra {
  layer: string;
  role: string;
  why: string;
}

/**
 * The checks for one effect: every role and gradient the runtime asked for is in the static list; every layer drew
 * something (unless it is listed as never drawing); and the roles in the list the runtime never asked for are exactly the
 * expected ones, each a role a field names (a colour the layer's kind draws, or a gradient's stop, is always asked for).
 */
export function checkEffectColours(fx: EffectFile, palette: Palette, sweep: Sweep, expected: readonly Extra[], neverDrawn: readonly string[] = []): void {
  const asked = askedByLayer(fx, palette, sweep);
  const extras: string[] = [];
  // Every visible layer was drawn, in a tier it shows in.
  const visible = fx.layers.filter((l) => l.type !== 'projectile') as VisibleLayer[];
  expect(asked.filter((a) => a.tier !== undefined).length, `${fx.id}: layers drawn`).toBe(visible.length);
  fx.layers.forEach((l, i) => {
    if (l.type === 'projectile') return;
    expect(l.tiers, `"${l.id}" was drawn in a tier it shows in`).toContain(asked[i]!.tier);
    const list: ColourList = layerColours(l, { index: i, main: fx.controls.colour, palette });
    const roles = new Set(list.colours.flatMap((c) => (c.role === undefined ? [] : [c.role])));
    const a = asked[i]!;
    expect([...a.roles].filter((r) => !roles.has(r)), `"${l.id}" asked for colours its list does not hold`).toEqual([]);
    expect([...a.gradients].filter((g) => !list.gradients.some((x) => x.name === g)), `"${l.id}" asked for gradients its list does not hold`).toEqual([]);
    if (neverDrawn.includes(l.id)) expect(a.triangles, `"${l.id}" should never draw`).toBe(0);
    else expect(a.triangles, `"${l.id}" drew nothing, so it proves nothing`).toBeGreaterThan(0);
    for (const r of roles) {
      if (a.roles.has(r)) continue;
      const kinds = [...new Set(list.colours.filter((c) => c.role === r).map((c) => c.why))];
      expect(kinds.every((w) => w === 'field' || w === 'main'), `"${l.id}": ${r} (${kinds.join(', ')}) is never asked for, but only a role a field names may be`).toBe(true);
      extras.push(`${l.id}: ${r}`);
    }
  });
  expect(extras.sort()).toEqual(expected.map((x) => `${x.layer}: ${x.role}`).sort());
}

/** Every example effect, as read from its file. */
export function exampleEffects(): { project: string; file: string; fx: EffectFile }[] {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples');
  const out: { project: string; file: string; fx: EffectFile }[] = [];
  for (const project of readdirSync(root).sort()) {
    for (const file of readdirSync(join(root, project, 'effects')).sort()) {
      out.push({ project, file, fx: JSON.parse(readFileSync(join(root, project, 'effects', file), 'utf8')) as EffectFile });
    }
  }
  return out;
}

/**
 * The example tests for one faction (split by faction so the three run side by side). In the examples the runtime asks
 * for every colour on each layer's list, so no example layer has an extra to explain: a new one fails here.
 */
export function exampleSuite(faction: FactionId): void {
  describe(`the colours each example layer asks the palette for, for the ${faction}`, () => {
    for (const { project, file, fx } of exampleEffects()) {
      it(`${project}/${file}: every made-by, each layer in a tier it shows in, 60 frames a second`, () => {
        checkEffectColours(fx, builtIn, { factions: [faction], relations: RELATIONS, seeds: [1] }, []);
      }, 120_000);
    }
  });
}

