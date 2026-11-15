import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import paletteJson from '../../vfx-format/palette/palette.json';
import { newBurstLayer, newEffect, newSpriteLayer } from '@shamble/vfx-format';
import type { EffectFile, Palette, Vec3 } from '@shamble/vfx-format';
import { DrawSink, EffectPlayer, VfxRenderer, evaluate } from '../src/index';
import type { CameraBasis, EvalContext } from '../src/index';

const palette = paletteJson as Palette;
const cam: CameraBasis = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };
const inputs = { origin: [0, 1.3, 0] as Vec3, target: [8, 0, 0] as Vec3 };
const have = new Set(['flash.png']);

/** A flash that loads, a smoke puff and a burst of chips whose images are missing, one more missing image only in High, and one that starts late. */
function effect(id = 'shot'): EffectFile {
  const fx = newEffect(id, 'Shot');
  fx.layers = [
    newSpriteLayer('flash', 'Flash', 'flash.png'),
    newSpriteLayer('puff', 'Puff', 'puff.png'),
    { ...newBurstLayer('chips', 'Chips'), look: { kind: 'image', image: 'chip.png', tint: { mode: 'keep' } } },
    { ...newSpriteLayer('glint', 'Glint', 'glint.png'), tiers: ['high'] },
    { ...newSpriteLayer('late', 'Late', 'late.png'), start: { ms: 400 } },
  ];
  return fx;
}

const ctx = (timeMs: number, over: Partial<EvalContext> = {}): EvalContext => ({
  seed: 1, timeMs, inputs, faction: 'soviets', palette, camera: cam,
  imageRect: (name) => (have.has(name) ? { u0: 0, v0: 0, u1: 0.5, v1: 0.5 } : undefined), ...over,
});

describe('layers the runtime cannot draw', () => {
  it('names each layer it skips for a missing image, with the effect, the layer and the image', () => {
    const r = evaluate(effect(), ctx(50, { tier: 'medium' }), new DrawSink(64));
    expect(r.notDrawn).toEqual([
      { effect: 'shot', layer: 'puff', index: 1, image: 'puff.png' },
      { effect: 'shot', layer: 'chips', index: 2, image: 'chip.png' },
    ]);
    expect(r.missingImages).toEqual(['puff.png', 'chip.png']);
    // In High the glint shows too; the late layer is not on yet at 50 ms. At 450 ms the sprites of 250 ms are over, the
    // chips (pieces live 600 to 900 ms) are still on, and the late layer has started.
    expect(evaluate(effect(), ctx(50, { tier: 'high' }), new DrawSink(64)).notDrawn.map((m) => m.layer)).toEqual(['puff', 'chips', 'glint']);
    expect(evaluate(effect(), ctx(450, { tier: 'high' }), new DrawSink(64)).notDrawn.map((m) => m.layer)).toEqual(['chips', 'late']);
  });

  it('keeps them in VfxRenderer\'s stats for the frame: once per effect and layer, cleared by the next begin()', () => {
    const vfx = new VfxRenderer(palette);
    vfx.setAtlas({ image: {} as ImageBitmap, width: 64, height: 32, rects: { 'flash.png': { x: 0, y: 0, w: 16, h: 16 }, __white: { x: 20, y: 2, w: 8, h: 8 } } });
    vfx.tier = 'medium';
    const camera = new PerspectiveCamera(15, 16 / 9, 1, 400);
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    const shot = effect(), other = effect('other');
    const player = new EffectPlayer();
    player.start('shot', { seed: 3, inputs, faction: 'soviets', nowMs: 0 });

    vfx.begin(camera);
    vfx.draw(shot, { seed: 1, timeMs: 50, inputs, faction: 'soviets' });
    vfx.drawPlaying(player, 60, (id) => (id === 'shot' ? shot : undefined));
    vfx.draw(other, { seed: 1, timeMs: 50, inputs, faction: 'soviets' });
    const stats = vfx.stats;
    expect(stats.effects).toBe(3);
    expect(stats.notDrawn.map((m) => `${m.effect}/${m.layer}: ${m.image}`)).toEqual([
      'shot/puff: puff.png', 'shot/chips: chip.png', 'other/puff: puff.png', 'other/chips: chip.png',
    ]);

    vfx.begin(camera);
    expect(vfx.stats.notDrawn).toEqual([]);
    // The list handed out with last frame's stats stays as it was.
    expect(stats.notDrawn).toHaveLength(4);
    vfx.dispose();
  });
});
