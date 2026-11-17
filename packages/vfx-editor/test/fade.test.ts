import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import paletteJson from '@shamble/vfx-format/palette.json';
import type { EffectFile, Palette } from '@shamble/vfx-format';
import { BLEND_GROUPS, VfxRenderer } from '@shamble/vfx-runtime';
import type { BlendGroup } from '@shamble/vfx-runtime';
import { FADE_TO, fadeOthers, keptLayers, sinkMarks } from '../src/app/fade';
import { makeGameCamera } from '../src/preview/camera';

const palette = paletteJson as Palette;
const repo = resolve(import.meta.dirname, '..', '..', '..');
const effect = (id: string) => JSON.parse(readFileSync(join(repo, 'examples', 'demo-project', 'effects', `${id}.vfx.json`), 'utf8')) as EffectFile;
/** An atlas with only the runtime's own blocks: the shapes, bursts and words draw with them. */
const atlas = { image: {} as ImageBitmap, width: 64, height: 32, rects: { __white: { x: 2, y: 2, w: 8, h: 8 }, __dot: { x: 14, y: 2, w: 16, h: 16 } } };
const inputs = { origin: [-3, 1.2, 1] as [number, number, number], target: [2, 1.1, -0.5] as [number, number, number] };
const index = (fx: EffectFile, id: string) => fx.layers.findIndex((l) => l.id === id);

/** One effect drawn at one moment, as the preview draws it; `fade` runs after the draw, before anything would go to the GPU. */
function drawn(fx: EffectFile, ms: number, fade?: (vfx: VfxRenderer, from: number[]) => void) {
  const vfx = new VfxRenderer(palette);
  vfx.setAtlas(atlas);
  vfx.begin(makeGameCamera());
  const from = sinkMarks(vfx.sink);
  vfx.draw(fx, { seed: 7, timeMs: ms, inputs, faction: 'soviets' });
  fade?.(vfx, from);
  return Object.fromEntries(BLEND_GROUPS.map((g) => {
    const b = vfx.sink.groups[g];
    return [g, { col: Array.from(b.col.subarray(0, b.vcount * 4)), layer: Array.from(b.layer.subarray(0, b.vcount)) }];
  })) as Record<BlendGroup, { col: number[]; layer: number[] }>;
}

/** How each vertex changed from `before` to `after`, by what the fade does to its blend group. */
function changes(before: ReturnType<typeof drawn>, after: ReturnType<typeof drawn>, keep: Set<number>) {
  const out = { kept: 0, alpha: 0, light: 0, multiply: 0, screen: 0, wrong: [] as string[] };
  for (const g of BLEND_GROUPS) {
    const a = before[g], b = after[g];
    if (a.layer.join() !== b.layer.join()) out.wrong.push(`${g}: other vertices`);
    for (let v = 0; v < a.layer.length; v++) {
      const [r, gg, bb, al] = a.col.slice(v * 4, v * 4 + 4) as [number, number, number, number];
      const got = b.col.slice(v * 4, v * 4 + 4);
      let want: number[];
      if (keep.has(a.layer[v]!)) { want = [r, gg, bb, al]; out.kept++; }
      else if ((g === 'ground' || g === 'top') && al < 0) { want = [r * FADE_TO, gg * FADE_TO, bb * FADE_TO, al]; out.light++; }
      else {
        want = [r, gg, bb, al * FADE_TO];
        if (g === 'ground-multiply') out.multiply++; else if (g === 'ground-screen') out.screen++; else out.alpha++;
      }
      if (want.some((x, k) => Math.fround(x) !== got[k])) out.wrong.push(`${g} vertex ${v}: ${got.join(',')} not ${want.join(',')}`);
    }
  }
  return out;
}

describe('fade other layers', () => {
  it('keeps the layer in focus, or a projectile\'s riders (it draws nothing itself)', () => {
    const shell = effect('board_shell'), rifle = effect('rifle_shot');
    expect([...keptLayers(shell, 'ring')!]).toEqual([index(shell, 'ring')]);
    expect([...keptLayers(shell, 'shell')!].sort()).toEqual([index(shell, 'shell'), index(shell, 'trail')].sort());
    expect([...keptLayers(rifle, 'bullet')!].sort()).toEqual([index(rifle, 'bullet'), index(rifle, 'tracer'), index(rifle, 'tracer_core')].sort());
    expect(keptLayers(rifle, 'no_such_layer')).toBeUndefined();
  });

  it('fades the other layers by blend group: normal by alpha, added light by its colour, light on the ground by alpha', () => {
    const fx = effect('board_beam');
    const keep = keptLayers(fx, 'beam_core')!;
    const c = changes(drawn(fx, 1000), drawn(fx, 1000, (vfx, from) => fadeOthers(vfx.sink, from, keep)), keep);
    expect(c.wrong).toEqual([]);
    expect(c.kept).toBeGreaterThan(0);
    expect(c.alpha).toBeGreaterThan(0);
    expect(c.light).toBeGreaterThan(0);
    expect(c.screen).toBeGreaterThan(0);
  });

  it('moves stains (multiply) towards white by their alpha, and fades the rest of a blast', () => {
    const fx = effect('board_shell');
    const keep = keptLayers(fx, 'burst')!;
    const c = changes(drawn(fx, 1300), drawn(fx, 1300, (vfx, from) => fadeOthers(vfx.sink, from, keep)), keep);
    expect(c.wrong).toEqual([]);
    expect(c.kept).toBeGreaterThan(0);
    expect(c.multiply).toBeGreaterThan(0);
    expect(c.alpha).toBeGreaterThan(0);
  });

  it('keeps a projectile\'s riders at full strength', () => {
    const fx = effect('board_shell');
    const keep = keptLayers(fx, 'shell')!;
    const c = changes(drawn(fx, 300), drawn(fx, 300, (vfx, from) => fadeOthers(vfx.sink, from, keep)), keep);
    expect(c.wrong).toEqual([]);
    // The trail rides the shell: its vertices are the ones kept.
    expect(c.kept).toBeGreaterThan(0);
    expect(c.alpha).toBeGreaterThan(0);
  });

  it('changes nothing when every layer is kept, and nothing drawn before the draw it is given', () => {
    const fx = effect('board_beam');
    const all = new Set(fx.layers.map((_, i) => i));
    expect(drawn(fx, 1000, (vfx, from) => fadeOthers(vfx.sink, from, all))).toEqual(drawn(fx, 1000));
    // Two draws in one frame (a fired effect after the effect shown): only the second one's vertices fade.
    const vfx = new VfxRenderer(palette);
    vfx.setAtlas(atlas);
    vfx.begin(makeGameCamera());
    vfx.draw(fx, { seed: 7, timeMs: 1000, inputs, faction: 'soviets' });
    const first = BLEND_GROUPS.map((g) => Array.from(vfx.sink.groups[g].col.subarray(0, vfx.sink.groups[g].vcount * 4)));
    const from = sinkMarks(vfx.sink);
    vfx.draw(fx, { seed: 7, timeMs: 1000, inputs, faction: 'soviets' });
    fadeOthers(vfx.sink, from, new Set());
    BLEND_GROUPS.forEach((g, gi) => {
      const b = vfx.sink.groups[g];
      expect(Array.from(b.col.subarray(0, from[gi]! * 4))).toEqual(first[gi]);
      // The second copy is the first one, faded.
      for (let v = from[gi]!; v < b.vcount; v++) {
        const src = (v - from[gi]!) * 4, a = first[gi]![src + 3]!;
        const light = (g === 'ground' || g === 'top') && a < 0;
        expect(b.col[v * 4 + 3]).toBe(light ? a : Math.fround(a * FADE_TO));
      }
    });
  });
});
